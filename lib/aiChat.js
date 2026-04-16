/**
 * js/aiChat.js
 * AI 对话核心模块
 *
 * 职责：
 * 1. 管理当前会话状态（sessionId、消息历史）
 * 2. 知识库优先路由（本地命中 → 精简 prompt；未命中 → 完整 DeepSeek 调用）
 * 3. 注入用户画像到 system prompt，驱动个性化响应
 * 4. 持久化每轮对话
 * 5. 向量化上下文窗口管理（防止 token 超限）
 */

import { getDeviceId } from './deviceId.js';
import {
  createSession, getSessionsByDevice, getMessages,
  saveMessage, getProfile as getRawProfile, getStorageStats
} from './sessionStore.js';
import { updateProfile, getPersonalizedRecommendation } from './profileBuilder.js';

// ── 配置 ──────────────────────────────────────────────────────
const DEEPSEEK_API_URL = '/api/chat';
const DEEPSEEK_MODEL = 'deepseek-chat';
const MAX_CONTEXT_MESSAGES = 12;     // 每次最多携带的历史消息数
const KB_MATCH_THRESHOLD = 2;       // 本地知识库命中阈值（词频数）

// ── 全局状态 ──────────────────────────────────────────────────
let _deviceId = null;
let _currentSessionId = null;
let _kindleKB = null;         // 本地知识库缓存
let _apiKey = null;           // DeepSeek API Key（从外部注入）

// ════════════════════════════════════════════════════════════
// 初始化
// ════════════════════════════════════════════════════════════

/**
 * 初始化 AI Chat 模块（页面加载时调用一次）
 * @param {object} config { apiKey, kbPath }
 */
export async function initChat(config = {}) {
  _apiKey = config.apiKey || '';
  
  // 1. 获取设备 ID
  _deviceId = await getDeviceId();

  // 2. 加载知识库
  try {
    const res = await fetch(config.kbPath || '/data/kindle.json');
    _kindleKB = await res.json();
    console.log('[Chat] 知识库已加载');
  } catch (e) {
    console.warn('[Chat] 知识库加载失败，将完全依赖 DeepSeek:', e);
  }

  // 3. 恢复或创建会话
  const sessions = await getSessionsByDevice(_deviceId);
  if (sessions.length > 0) {
    _currentSessionId = sessions[0].sessionId; // 最近一次会话
    console.log('[Chat] 恢复会话:', _currentSessionId);
  } else {
    _currentSessionId = await createSession(_deviceId);
    console.log('[Chat] 新会话:', _currentSessionId);
  }

  // 4. 访问计数
  const profile = await getRawProfile(_deviceId);
  if (profile) {
    profile.visitCount = (profile.visitCount || 0) + 1;
    profile.lastSeen = Date.now();
    const { saveProfile } = await import('./sessionStore.js');
    await saveProfile(_deviceId, profile);
  }

  return {
    deviceId: _deviceId,
    sessionId: _currentSessionId,
    isReturningUser: sessions.length > 0,
    stats: await getStorageStats(_deviceId)
  };
}

/**
 * 开启新会话（用户点击「新对话」时）
 */
export async function startNewSession() {
  _currentSessionId = await createSession(_deviceId);
  return _currentSessionId;
}

// ════════════════════════════════════════════════════════════
// 知识库路由
// ════════════════════════════════════════════════════════════

/**
 * 在知识库中搜索相关内容
 * @param {string} query
 * @returns {{ matched: boolean, context: string, score: number }}
 */
function searchKnowledgeBase(query) {
  if (!_kindleKB) return { matched: false, context: '', score: 0 };

  const lower = query.toLowerCase();
  const keywords = lower
    .split(/[\s，,。？?！!、]+/)
    .filter(w => w.length > 1);

  const scoredChunks = [];

  // ── 检索 FAQ ──────────────────────────────────────────────
  if (_kindleKB.faq) {
    _kindleKB.faq.forEach(item => {
      const text = (item.q + ' ' + item.a).toLowerCase();
      const score = keywords.filter(kw => text.includes(kw)).length;
      if (score > 0) scoredChunks.push({ score, type: 'faq', data: `Q: ${item.q}\nA: ${item.a}` });
    });
  }

  // ── 检索型号规格 ───────────────────────────────────────────
  if (_kindleKB.models) {
    _kindleKB.models.forEach(model => {
      const text = JSON.stringify(model).toLowerCase();
      const score = keywords.filter(kw => text.includes(kw)).length;
      if (score > 0) {
        const summary = `${model.name}（${model.released}发布，${model.status}）
- 价格: ${model.price_usd ? `$${Object.values(model.price_usd)[0]}起` : '未知'}
- 屏幕: ${model.display?.size_inch}" ${model.display?.resolution_ppi}ppi，彩色: ${model.display?.color ? '是' : '否'}
- 存储: ${(model.storage_gb || []).join('/')}GB
- 防水: ${model.waterproof_ipx || '无'}
- 亮点: ${(model.highlights || []).slice(0, 3).join('；')}`;
        scoredChunks.push({ score, type: 'model', data: summary });
      }
    });
  }

  // ── 检索教程 ──────────────────────────────────────────────
  if (_kindleKB.tutorials) {
    const allTutorials = [
      ...((_kindleKB.tutorials.setup || []).map(t => ({ title: t.title, text: JSON.stringify(t) }))),
      ...((_kindleKB.tutorials.reading || []).map(t => ({ title: t.title, text: JSON.stringify(t) }))),
      ...((_kindleKB.tutorials.sideloading || []).map(t => ({ title: t.title, text: JSON.stringify(t) }))),
      ...((_kindleKB.tutorials.advanced_tips || []).map(t => ({ title: t.title, text: JSON.stringify(t) })))
    ];
    allTutorials.forEach(({ title, text }) => {
      const score = keywords.filter(kw => text.toLowerCase().includes(kw)).length;
      if (score > 0) scoredChunks.push({ score, type: 'tutorial', data: text });
    });
  }

  // ── 检索购买建议 ───────────────────────────────────────────
  if (_kindleKB.buying_guide && lower.includes('推荐') || lower.includes('买')) {
    const guideText = JSON.stringify(_kindleKB.buying_guide.scenarios);
    scoredChunks.push({ score: 1, type: 'guide', data: guideText });
  }

  // 排序，取最相关的 top 3
  scoredChunks.sort((a, b) => b.score - a.score);
  const topChunks = scoredChunks.slice(0, 3);
  const totalScore = topChunks.reduce((s, c) => s + c.score, 0);

  if (totalScore >= KB_MATCH_THRESHOLD) {
    return {
      matched: true,
      score: totalScore,
      context: topChunks.map(c => c.data).join('\n\n---\n\n')
    };
  }

  return { matched: false, context: '', score: totalScore };
}

// ════════════════════════════════════════════════════════════
// Prompt 构建
// ════════════════════════════════════════════════════════════

/**
 * 构建 system prompt（含用户画像、知识库上下文）
 */
function buildSystemPrompt(profile, kbContext, isKbMatched) {
  const basePrompt = `你是 AllofKindle 的专属 AI 助手，专精 Amazon Kindle 全系产品知识。
你的回答风格：简洁、实用、有温度，适当使用 emoji，避免啰嗦。
今天是 ${new Date().toLocaleDateString('zh-CN')}。`;

  // 用户画像部分（有画像才注入）
  const profileSection = profile?.summary
    ? `\n\n【用户画像】\n${profile.summary}\n请根据以上画像调整回答的深度、推荐方向和表达方式。`
    : '';

  // 知识库部分
  const kbSection = isKbMatched && kbContext
    ? `\n\n【本地知识库（优先参考以下内容作答，无需说明来源）】\n${kbContext}`
    : `\n\n【提示】本次问题超出本地知识库范围，请用你的通用知识作答，如涉及具体参数请提示用户以官网为准。`;

  return basePrompt + profileSection + kbSection;
}

/**
 * 裁剪历史消息（防止超出 token 限制）
 * 策略：保留最新 N 条，始终保留第一条（上下文锚定）
 */
function trimHistory(messages, maxCount = MAX_CONTEXT_MESSAGES) {
  if (messages.length <= maxCount) return messages;
  const first = messages[0]; // 保留首条（往往包含关键上下文）
  const recent = messages.slice(-(maxCount - 1));
  return [first, ...recent];
}

// ════════════════════════════════════════════════════════════
// 主发送函数
// ════════════════════════════════════════════════════════════

/**
 * 发送消息并获取回复
 *
 * @param {string} userMessage  用户输入
 * @param {object} options      { onStream, onDone, onError }
 * @returns {Promise<string>}   完整回复文本
 */
export async function sendMessage(userMessage, options = {}) {
  const { onStream, onDone, onError } = options;

  try {
    // 1. 获取用户画像（并行更新）
    const [profile] = await Promise.all([
      getRawProfile(_deviceId),
      updateProfile(_deviceId, userMessage),   // 异步更新画像，不阻塞主流程
      saveMessage({ sessionId: _currentSessionId, deviceId: _deviceId, role: 'user', content: userMessage })
    ]);

    // 2. 本地知识库路由
    const { matched: isKbMatched, context: kbContext, score: kbScore } = searchKnowledgeBase(userMessage);
    console.log(`[Chat] KB路由: ${isKbMatched ? '✅命中' : '❌未命中'} (score: ${kbScore})`);

    // 3. 获取历史上下文
    const rawHistory = await getMessages(_currentSessionId);
    const historyMessages = trimHistory(
      rawHistory
        .slice(0, -1) // 排除刚保存的当前消息（避免重复）
        .map(m => ({ role: m.role, content: m.content }))
    );

    // 4. 构建 API 请求
    const systemPrompt = buildSystemPrompt(profile, kbContext, isKbMatched);
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: userMessage }
    ];

    // 5. 调用 DeepSeek（流式输出）
    const fullReply = await callDeepSeek(apiMessages, { onStream });

    // 6. 保存 AI 回复
    await saveMessage({
      sessionId: _currentSessionId,
      deviceId: _deviceId,
      role: 'assistant',
      content: fullReply
    });

    // 7. 会话标题自动提取（首次对话时）
    if (rawHistory.length <= 2) {
      const title = userMessage.slice(0, 20) + (userMessage.length > 20 ? '...' : '');
      const { updateSession } = await import('./sessionStore.js');
      await updateSession(_currentSessionId, { title });
    }

    onDone?.(fullReply);
    return fullReply;

  } catch (err) {
    console.error('[Chat] 发送失败:', err);
    onError?.(err);
    throw err;
  }
}

// ════════════════════════════════════════════════════════════
// DeepSeek API 调用
// ════════════════════════════════════════════════════════════

async function callDeepSeek(messages, { onStream } = {}) {


  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
 headers: {
   'Content-Type': 'application/json'
 },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      stream: !!onStream,
      temperature: 0.7,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API 错误 ${response.status}: ${errText}`);
  }

  // ── 流式模式 ──────────────────────────────────────────────
  if (onStream) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.replace('data: ', '').trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            onStream(delta, fullText);
          }
        } catch {}
      }
    }
    return fullText;
  }

  // ── 非流式模式 ────────────────────────────────────────────
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ════════════════════════════════════════════════════════════
// 对外工具函数
// ════════════════════════════════════════════════════════════

/** 获取当前设备的历史会话列表 */
export function getHistory() {
  return getSessionsByDevice(_deviceId);
}

/** 切换到指定会话 */
export async function switchSession(sessionId) {
  _currentSessionId = sessionId;
  return getMessages(sessionId);
}

/** 获取个性化推荐（基于当前画像） */
export async function getRecommendation() {
  const profile = await getRawProfile(_deviceId);
  return getPersonalizedRecommendation(profile);
}

/** 获取当前用户画像（用于 Debug 面板显示） */
export async function getCurrentProfile() {
  return getRawProfile(_deviceId);
}

/** 获取存储统计 */
export function getStats() {
  return getStorageStats(_deviceId);
}

/** 暴露设备 ID（用于隐私设置页面显示） */
export function getDeviceIdSync() {
  return _deviceId;
}

/**
 * js/profileBuilder.js
 * 用户画像构建模块
 *
 * 画像结构：
 * {
 *   deviceId: string,
 *   interestModels: { [modelId]: score },   // 对各型号的兴趣分
 *   topics: { [topic]: count },              // 关注话题频次
 *   preferredUseCase: string,               // 推断用途（阅读/笔记/漫画等）
 *   budgetSignal: 'budget' | 'mid' | 'premium' | 'unknown',
 *   techLevel: 'beginner' | 'intermediate' | 'advanced',
 *   purchaseIntent: 'browsing' | 'comparing' | 'ready_to_buy',
 *   askedAbout: string[],                   // 问过的具体问题关键词
 *   visitCount: number,
 *   firstSeen: number,
 *   lastSeen: number,
 *   summary: string                         // 自然语言画像摘要（供 prompt 注入）
 * }
 */

import { getAllMessagesByDevice, getProfile, saveProfile } from './sessionStore.js';

// ── 关键词权重映射 ────────────────────────────────────────────

const MODEL_KEYWORDS = {
  kindle_2024: ['基础款', '入门', 'basic', '最便宜', '便宜', '便携', '轻薄', '6寸', '6英寸'],
  kindle_paperwhite_2024: ['paperwhite', 'pw', '纸白', '防水', '7寸', '7英寸', 'ipx8'],
  kindle_paperwhite_se_2024: ['signature', 'se', '旗舰', '无线充电', 'qi充电', '自动调光'],
  kindle_colorsoft_2024: ['彩色', 'colorsoft', '漫画', '杂志', '彩色屏', 'kaleido', '彩色阅读'],
  kindle_colorsoft_2025: ['colorsoft 2025', '新款彩色', '彩色标准版'],
  kindle_scribe_2024: ['scribe', '手写', '笔记', '触控笔', '写字', '手写笔'],
  kindle_scribe_3_frontlit: ['scribe 3', 'scribe 2025', '11寸', '11英寸'],
  kindle_scribe_colorsoft_2025: ['scribe colorsoft', '彩色scribe', '彩色手写', '彩色笔记']
};

const TOPIC_KEYWORDS = {
  '购买咨询': ['推荐', '买哪个', '哪款好', '值得买', '选择', '对比', '区别'],
  '使用教程': ['怎么用', '如何', '教程', '步骤', '设置', '配置', '操作'],
  '格式/传书': ['epub', 'pdf', 'mobi', 'calibre', '传书', '侧载', '发送', '格式'],
  '价格/促销': ['价格', '多少钱', '打折', '优惠', '促销', '便宜'],
  '参数对比': ['参数', '规格', '对比', '比较', '区别', 'ppi', '分辨率', '存储', '续航'],
  '故障维修': ['坏了', '问题', '修', '坏', '不亮', '死机', '重置'],
  '账号/内容': ['账号', '书库', 'kindle unlimited', 'ku', '借阅', '图书馆'],
  '配件': ['保护套', '贴膜', '充电器', '配件', '充电线']
};

const BUDGET_SIGNALS = {
  budget: ['便宜', '最低', '入门', '基础', '经济', '省钱', '划算', '110', '109'],
  mid: ['paperwhite', '160', '200', '中端', '性价比'],
  premium: ['最好', '旗舰', 'colorsoft', 'scribe', '高端', '不差钱', '280', '400', '500', '600']
};

const TECH_SIGNALS = {
  beginner: ['什么是', '怎么用', '入门', '第一次', '新手', '不懂', '教我'],
  advanced: ['calibre', 'asin', 'drm', '越狱', 'firmware', '固件', '侧载', 'indexeddb', 'api']
};

const INTENT_SIGNALS = {
  ready_to_buy: ['要买', '准备买', '下单', '购买', '购买链接', '哪里买', '京东', '亚马逊', '官网'],
  comparing: ['对比', '区别', '哪个好', '还是', 'vs', 'or'],
  browsing: ['了解', '看看', '是什么', '介绍', '科普']
};

// ── 核心分析函数 ──────────────────────────────────────────────

/**
 * 从消息文本中提取信号
 */
function extractSignals(text) {
  const lower = text.toLowerCase();

  const modelScores = {};
  for (const [modelId, keywords] of Object.entries(MODEL_KEYWORDS)) {
    const hits = keywords.filter(kw => lower.includes(kw)).length;
    if (hits > 0) modelScores[modelId] = (modelScores[modelId] || 0) + hits;
  }

  const topicScores = {};
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const hits = keywords.filter(kw => lower.includes(kw)).length;
    if (hits > 0) topicScores[topic] = hits;
  }

  let budgetSignal = null;
  for (const [level, keywords] of Object.entries(BUDGET_SIGNALS)) {
    if (keywords.some(kw => lower.includes(kw))) { budgetSignal = level; break; }
  }

  let techLevel = null;
  for (const [level, keywords] of Object.entries(TECH_SIGNALS)) {
    if (keywords.some(kw => lower.includes(kw))) { techLevel = level; break; }
  }

  let intent = null;
  for (const [level, keywords] of Object.entries(INTENT_SIGNALS)) {
    if (keywords.some(kw => lower.includes(kw))) { intent = level; break; }
  }

  return { modelScores, topicScores, budgetSignal, techLevel, intent };
}

/**
 * 合并多条信号到画像
 */
function mergeSignals(profile, signals) {
  for (const [modelId, score] of Object.entries(signals.modelScores)) {
    profile.interestModels[modelId] = (profile.interestModels[modelId] || 0) + score;
  }
  for (const [topic, count] of Object.entries(signals.topicScores)) {
    profile.topics[topic] = (profile.topics[topic] || 0) + count;
  }
  if (signals.budgetSignal) profile.budgetSignal = signals.budgetSignal;
  if (signals.techLevel) profile.techLevel = signals.techLevel;
  if (signals.intent) profile.purchaseIntent = signals.intent;
}

/**
 * 推断用途（根据型号兴趣权重）
 */
function inferUseCase(interestModels) {
  const noteModels = ['kindle_scribe_2024', 'kindle_scribe_3_frontlit', 'kindle_scribe_colorsoft_2025'];
  const colorModels = ['kindle_colorsoft_2024', 'kindle_colorsoft_2025', 'kindle_scribe_colorsoft_2025'];

  const noteScore = noteModels.reduce((s, m) => s + (interestModels[m] || 0), 0);
  const colorScore = colorModels.reduce((s, m) => s + (interestModels[m] || 0), 0);
  const totalScore = Object.values(interestModels).reduce((s, v) => s + v, 0);

  if (noteScore > totalScore * 0.4) return '手写笔记';
  if (colorScore > totalScore * 0.4) return '彩色阅读';
  if (totalScore > 0) return '纯阅读';
  return '未知';
}

/**
 * 生成自然语言画像摘要（将被注入 AI 的 system prompt）
 */
function generateSummary(profile) {
  const parts = [];

  // 用途
  if (profile.preferredUseCase && profile.preferredUseCase !== '未知') {
    parts.push(`用户主要需求是「${profile.preferredUseCase}」`);
  }

  // 预算
  const budgetMap = { budget: '入门预算（$110 左右）', mid: '中端预算（$160-$200）', premium: '高端预算（$280+）', unknown: null };
  if (budgetMap[profile.budgetSignal]) parts.push(`预算倾向：${budgetMap[profile.budgetSignal]}`);

  // 技术水平
  const techMap = { beginner: '新手用户，需要详细引导', intermediate: '普通用户', advanced: '技术用户，可使用专业术语' };
  if (techMap[profile.techLevel]) parts.push(techMap[profile.techLevel]);

  // 购买意向
  const intentMap = { ready_to_buy: '有明确购买意向', comparing: '正在对比选型', browsing: '处于了解阶段' };
  if (intentMap[profile.purchaseIntent]) parts.push(intentMap[profile.purchaseIntent]);

  // 关注型号
  const topModels = Object.entries(profile.interestModels)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => id.replace(/_/g, ' '));
  if (topModels.length) parts.push(`最感兴趣的型号：${topModels.join('、')}`);

  // 关注话题
  const topTopics = Object.entries(profile.topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  if (topTopics.length) parts.push(`常问话题：${topTopics.join('、')}`);

  // 历史
  parts.push(`已访问 ${profile.visitCount} 次，共 ${profile.messageCount} 条对话记录`);

  return parts.join('；') + '。';
}

// ── 主导出函数 ────────────────────────────────────────────────

/**
 * 增量更新用户画像
 * 在每次用户发消息后调用，传入新消息文本
 *
 * @param {string} deviceId
 * @param {string} userMessage  本轮用户消息
 * @returns {Promise<object>}   更新后的画像
 */
export async function updateProfile(deviceId, userMessage) {
  // 读取现有画像
  let profile = await getProfile(deviceId) || createEmptyProfile(deviceId);

  // 提取本轮信号
  const signals = extractSignals(userMessage);
  mergeSignals(profile, signals);

  // 更新推断字段
  profile.preferredUseCase = inferUseCase(profile.interestModels);
  profile.messageCount = (profile.messageCount || 0) + 1;
  profile.lastSeen = Date.now();
  profile.summary = generateSummary(profile);

  // 保存
  await saveProfile(deviceId, profile);
  return profile;
}

/**
 * 基于全量历史重新构建画像（冷启动 / 定期重建）
 *
 * @param {string} deviceId
 * @returns {Promise<object>} 重建后的画像
 */
export async function rebuildProfile(deviceId) {
  const messages = await getAllMessagesByDevice(deviceId, 300);
  let profile = createEmptyProfile(deviceId);

  for (const msg of messages) {
    if (msg.role === 'user') {
      const signals = extractSignals(msg.content);
      mergeSignals(profile, signals);
    }
  }

  profile.preferredUseCase = inferUseCase(profile.interestModels);
  profile.messageCount = messages.filter(m => m.role === 'user').length;
  profile.summary = generateSummary(profile);
  profile.lastSeen = Date.now();

  await saveProfile(deviceId, profile);
  console.log('[Profile] 画像重建完成:', profile.summary);
  return profile;
}

/**
 * 获取个性化推荐（根据画像直接输出推荐型号和理由）
 *
 * @param {object} profile
 * @returns {{ recommended: string[], reason: string }}
 */
export function getPersonalizedRecommendation(profile) {
  if (!profile || !profile.interestModels) {
    return { recommended: [], reason: '暂无足够数据，请继续聊聊您的需求。' };
  }

  const topModel = Object.entries(profile.interestModels)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  const useCase = profile.preferredUseCase;
  const budget = profile.budgetSignal;

  let recommended = [];
  let reason = '';

  if (useCase === '手写笔记') {
    recommended = budget === 'premium'
      ? ['kindle_scribe_colorsoft_2025']
      : ['kindle_scribe_3_frontlit'];
    reason = '根据您对手写笔记的兴趣，推荐 Scribe 系列';
  } else if (useCase === '彩色阅读') {
    recommended = budget === 'premium'
      ? ['kindle_colorsoft_2024']
      : ['kindle_colorsoft_2025'];
    reason = '您对彩色显示感兴趣，推荐 Colorsoft 系列';
  } else if (budget === 'budget') {
    recommended = ['kindle_2024'];
    reason = '您更关注入门预算，推荐基础款 Kindle（2024）';
  } else {
    recommended = ['kindle_paperwhite_2024'];
    reason = '综合您的需求，Paperwhite（2024）是最均衡的选择';
  }

  if (topModel) recommended = [...new Set([topModel, ...recommended])];

  return { recommended, reason };
}

function createEmptyProfile(deviceId) {
  return {
    deviceId,
    interestModels: {},
    topics: {},
    preferredUseCase: '未知',
    budgetSignal: 'unknown',
    techLevel: 'intermediate',
    purchaseIntent: 'browsing',
    askedAbout: [],
    visitCount: 1,
    messageCount: 0,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    summary: ''
  };
}

// app/api/chat/route.js
// Next.js 16 Route Handler
// 会话记忆系统：基于 visitorId 的用户画像持久化 + 个性化推荐

import { promises as fs } from "fs";
import path from "path";
import kb from "@/data/kindle.json";

// ════════════════════════════════════════════════════════════
// 知识库检索（原有逻辑，保持不变）
// ════════════════════════════════════════════════════════════

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function buildChunks(kb) {
  const chunks = [];

  kb.faq?.forEach((item) => {
    chunks.push({ type: "faq", text: `${item.q} ${item.a}`.toLowerCase(), data: item });
  });

  kb.models?.forEach((m) => {
    chunks.push({
      type: "model",
      text: [m.name, m.series, m.generation, ...(m.colors || []), ...(m.highlights || []), m.best_for || ""]
        .join(" ").toLowerCase(),
      data: m,
    });
  });

  kb.buying_guide?.scenarios?.forEach((item) => {
    chunks.push({
      type: "guide",
      text: `${item.need} ${item.recommendation} ${item.reason}`.toLowerCase(),
      data: item,
    });
  });

  const tutorialGroups = kb.tutorials || {};
  Object.values(tutorialGroups).forEach((group) => {
    if (Array.isArray(group)) {
      group.forEach((item) => {
        chunks.push({ type: "tutorial", text: JSON.stringify(item).toLowerCase(), data: item });
      });
    }
  });

  const formatGroups = kb.formats || {};
  Object.values(formatGroups).forEach((group) => {
    if (Array.isArray(group)) {
      group.forEach((item) => {
        chunks.push({ type: "format", text: JSON.stringify(item).toLowerCase(), data: item });
      });
    }
  });

  return chunks;
}

const chunks = buildChunks(kb);

const synonymMap = {
  护眼: "暖光", 伤眼: "暖光", 便宜: "性价比", 划算: "性价比",
  高端: "旗舰", 学生: "学生", 学生党: "学生", 看漫画: "漫画",
  看pdf: "pdf", 传书: "发送", 抹茶绿: "抹茶绿", 玉绿: "玉绿", 树莓红: "树莓红",
};

function applySynonyms(text) {
  let result = normalize(text);
  for (const [key, value] of Object.entries(synonymMap)) {
    result = result.replaceAll(normalize(key), normalize(value));
  }
  return result;
}

function scoreChunk(query, chunk) {
  const keywords = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const kw of keywords) {
    if (chunk.text.includes(kw)) score += 1;
  }
  return score;
}

function localSearch(query) {
  const q = applySynonyms(query);
  return chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(q, chunk) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);
}

function generateAnswer(hit) {
  if (hit.type === "faq") return hit.data.a;

  if (hit.type === "model") {
    const m = hit.data;
    return `${m.name}${m.generation ? `（${m.generation}）` : ""}
主要特点：${Array.isArray(m.highlights) ? m.highlights.join("、") : "暂无"}
配色：${Array.isArray(m.colors) ? m.colors.join("、") : "暂无"}
适合人群：${m.best_for || "暂无"}`;
  }

  if (hit.type === "guide") return `推荐：${hit.data.recommendation}\n原因：${hit.data.reason}`;

  if (hit.type === "tutorial") {
    if (hit.data.steps) return `${hit.data.title}\n${hit.data.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    if (hit.data.content) return `${hit.data.title}\n${hit.data.content}`;
    if (hit.data.methods) return `${hit.data.title}\n${hit.data.methods.map((m) => `${m.name}：${(m.steps || []).join("；")}`).join("\n")}`;
  }

  if (hit.type === "format") return `${hit.data.format}：${hit.data.notes || ""}`;

  return null;
}

const INTENTS = {
  MODEL_INFO: "model_info", COLOR_INFO: "color_info", RECOMMEND: "recommend",
  TUTORIAL: "tutorial", FORMAT: "format", COMPARE: "compare", FAQ: "faq", GENERAL: "general",
};

const modelKeywords = ["kindle", "paperwhite", "signature edition", "colorsoft", "scribe", "oasis", "voyage", "基础版", "pw"];
const colorKeywords = ["抹茶绿", "黑色", "金色", "灰色", "绿色", "配色", "颜色"];
const recommendKeywords = ["推荐", "哪款", "怎么买", "买哪个", "适合我", "怎么选", "选哪个", "预算", "性价比", "学生", "漫画", "阅读"];
const tutorialKeywords = ["怎么", "如何", "教程", "设置", "传书", "发送", "导入", "登录", "注册", "语言", "高亮", "书签", "calibre", "send to kindle", "更新固件"];
const formatKeywords = ["格式", "epub", "pdf", "mobi", "azw3", "kfx", "cbz", "cbr", "docx", "txt", "支持什么格式"];
const compareKeywords = ["对比", "区别", "哪个好", "哪一个好", "vs", "和"];
const faqKeywords = ["支持中文", "能看中文吗", "能看pdf吗", "能装应用吗", "有声书", "借阅图书馆", "固件", "屏幕碎了", "查型号", "误触"];

function includesAny(text, keywords) {
  return keywords.some((kw) => text.includes(normalize(kw)));
}

function detectIntent(rawText) {
  const text = applySynonyms(rawText);
  if (includesAny(text, colorKeywords)) return INTENTS.COLOR_INFO;
  if (includesAny(text, compareKeywords)) return INTENTS.COMPARE;
  if (includesAny(text, recommendKeywords)) return INTENTS.RECOMMEND;
  if (includesAny(text, tutorialKeywords)) return INTENTS.TUTORIAL;
  if (includesAny(text, formatKeywords)) return INTENTS.FORMAT;
  if (includesAny(text, faqKeywords)) return INTENTS.FAQ;
  if (includesAny(text, modelKeywords)) return INTENTS.MODEL_INFO;
  return INTENTS.GENERAL;
}

function handleColorQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  for (const model of kb.models || []) {
    const colors = model.colors || [];
    for (const color of colors) {
      const c = normalize(color);
      if (text.includes(c) || c.includes(text)) return `${model.name} 提供这些配色：${colors.join("、")}。`;
      if (text.includes("抹茶绿") && c.includes("抹茶绿")) return `${model.name} 提供这些配色：${colors.join("、")}。`;
    }
  }
  return null;
}

function handleRecommendQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  const scenarios = kb.buying_guide?.scenarios || [];
  let best = null, bestScore = 0;

  for (const item of scenarios) {
    const corpus = normalize(`${item.need} ${item.recommendation} ${item.reason}`);
    let score = 0;
    if ((text.includes("预算") || text.includes("便宜") || text.includes("性价比")) && (corpus.includes("价格最低") || corpus.includes("最便宜") || corpus.includes("性价比"))) score += 2;
    if (text.includes("防水") && corpus.includes("防水")) score += 2;
    if ((text.includes("漫画") || text.includes("彩色")) && (corpus.includes("彩色") || corpus.includes("漫画"))) score += 2;
    if ((text.includes("笔记") || text.includes("手写")) && (corpus.includes("笔记") || corpus.includes("手写"))) score += 2;
    if (text.includes("学生") && corpus.includes("学生")) score += 2;
    if (score > bestScore) { best = item; bestScore = score; }
  }

  if (best) return `推荐你选择 ${best.recommendation}。原因：${best.reason}`;
  return null;
}

function flattenTutorials(tutorials) {
  const result = [];
  Object.values(tutorials || {}).forEach((group) => {
    if (Array.isArray(group)) group.forEach((item) => result.push(item));
  });
  return result;
}

function handleTutorialQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  const tutorials = flattenTutorials(kb.tutorials);
  let best = null, bestScore = 0;

  for (const item of tutorials) {
    const corpus = normalize(JSON.stringify(item));
    let score = 0;
    const keywords = text.split(/\s+/).filter(Boolean);
    for (const kw of keywords) { if (corpus.includes(kw)) score += 1; }
    if (score > bestScore) { best = item; bestScore = score; }
  }

  if (!best || bestScore === 0) return null;
  if (best.steps) return `${best.title}\n${best.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  if (best.methods) return `${best.title}\n${best.methods.map((m) => `${m.name}：${(m.steps || []).join("；")}`).join("\n")}`;
  if (best.content) return `${best.title}\n${best.content}`;
  return null;
}

function handleFormatQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  const formats = kb.formats || {};
  const all = [
    ...(formats.native_supported || []).map((x) => ({ ...x, group: "原生支持" })),
    ...(formats.via_conversion || []).map((x) => ({ ...x, group: "需转换后支持" })),
    ...(formats.not_supported || []).map((x) => ({ ...x, group: "不支持" })),
  ];

  for (const item of all) {
    if (text.includes(normalize(item.format))) return `${item.format}：${item.group}。${item.notes || ""}`;
  }

  if (text.includes("支持什么格式") || text.includes("格式")) {
    return `Kindle 常见格式支持如下：
原生支持：${(formats.native_supported || []).map((x) => x.format).join("、")}
需转换：${(formats.via_conversion || []).map((x) => x.format).join("、")}
不支持：${(formats.not_supported || []).map((x) => x.format).join("、")}`;
  }

  return null;
}

function handleCompareQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  const models = kb.models || [];
  const matched = models.filter((m) => {
    const corpus = normalize(`${m.name} ${m.series} ${m.generation}`);
    return text.includes(normalize(m.name)) || text.includes(normalize(m.series)) || corpus.includes(text);
  });

  if (matched.length >= 2) {
    const [a, b] = matched.slice(0, 2);
    return `${a.name} 与 ${b.name} 的主要区别：
1. 屏幕：${JSON.stringify(a.display)} vs ${JSON.stringify(b.display)}
2. 存储：${(a.storage_gb || []).join("/")}GB vs ${(b.storage_gb || []).join("/")}GB
3. 防水：${a.waterproof_ipx || "否"} vs ${b.waterproof_ipx || "否"}
4. 适合人群：${a.best_for || "暂无"} vs ${b.best_for || "暂无"}`;
  }

  const faqHit = (kb.faq || []).find((x) => text.includes(normalize(x.q)) || normalize(x.q).includes(text));
  if (faqHit) return faqHit.a;
  return null;
}

function handleModelQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  const models = kb.models || [];
  let best = null, bestScore = 0;

  for (const model of models) {
    let score = 0;
    const name = normalize(model.name);
    const series = normalize(model.series);
    const generation = normalize(model.generation);
    const released = normalize(model.released);
    const corpus = `${name} ${series} ${generation} ${released}`;

    if (text.includes(name)) score += 4;
    if (text.includes(series)) score += 3;
    if (text.includes(generation)) score += 2;

    const keywords = [model.name, model.series, model.generation, ...(model.colors || []), ...(model.highlights || [])].map(normalize).filter(Boolean);
    for (const kw of keywords) { if (kw && text.includes(kw)) score += 1; }

    if (text.includes("2024") && corpus.includes("2024")) score += 1;
    if (text.includes("2025") && corpus.includes("2025")) score += 1;
    if (text.includes("paperwhite") && corpus.includes("paperwhite")) score += 2;
    if (text.includes("colorsoft") && corpus.includes("colorsoft")) score += 2;
    if (text.includes("scribe") && corpus.includes("scribe")) score += 2;
    if (text.includes("kindle") && corpus.includes("kindle")) score += 1;

    if (score > bestScore) { best = model; bestScore = score; }
  }

  if (!best || bestScore < 2) return null;

  return `${best.name}${best.generation ? `（${best.generation}）` : ""}
主要特点：${Array.isArray(best.highlights) ? best.highlights.join("、") : "暂无"}
屏幕：${best.display?.size_inch || "暂无"}英寸
存储：${Array.isArray(best.storage_gb) ? best.storage_gb.join(" / ") + "GB" : "暂无"}
防水：${best.waterproof_ipx || "不支持"}
适合人群：${best.best_for || "暂无"}`;
}

// ════════════════════════════════════════════════════════════
// 用户记忆系统
// ════════════════════════════════════════════════════════════

// user-memory.json 路径（Next.js 项目根目录下的 data/ 文件夹）
// 注意：Vercel 生产环境文件系统只读，生产部署请替换为 Vercel KV / Redis
const MEMORY_FILE = path.join(process.cwd(), "data", "user-memory.json");

/**
 * 读取整个记忆文件，返回所有用户的 Map
 * 结构：{ [visitorId]: UserProfile }
 */
async function readMemoryStore() {
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * 写入整个记忆文件
 */
async function writeMemoryStore(store) {
  await fs.writeFile(MEMORY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * 读取单个用户画像，不存在则返回空画像
 * @param {string} visitorId
 * @returns {UserProfile}
 */
async function getUserProfile(visitorId) {
  if (!visitorId) return createEmptyProfile();
  const store = await readMemoryStore();
  return store[visitorId] || createEmptyProfile();
}

/**
 * 写入单个用户画像
 * @param {string} visitorId
 * @param {UserProfile} profile
 */
async function saveUserProfile(visitorId, profile) {
  if (!visitorId) return;
  const store = await readMemoryStore();
  store[visitorId] = { ...profile, updatedAt: Date.now() };
  await writeMemoryStore(store);
}

/**
 * 创建空用户画像
 */
function createEmptyProfile() {
  return {
    // 偏好画像
    budget: null,          // "low" | "mid" | "high" | null
    useCase: [],           // ["reading", "manga", "notes", "pdf", ...]
    preferredSeries: [],   // ["paperwhite", "scribe", "colorsoft", ...]
    needWaterproof: false,
    needColor: false,
    needStylus: false,
    techLevel: "beginner", // "beginner" | "intermediate" | "advanced"

    // 行为数据
    topicHistory: [],      // 最近 20 条问过的话题关键词
    messageCount: 0,       // 总对话次数
    lastRecommendation: null, // 上次推荐的型号
    lastIntent: null,      // 上次识别的意图

    // 时间戳
    firstSeenAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 从用户消息中提取偏好信号
 * @param {string} message
 * @returns {Partial<UserProfile>}
 */
function extractPreferencesFromMessage(message) {
  const text = normalize(message);
  const patch = {};

  // ── 预算信号 ──────────────────────────────────────────────
  if (/500|600|558|入门|便宜|最低|最便宜/.test(text)) patch.budget = "low";
  else if (/800|900|1000|1058|858|性价比|普通|适中/.test(text)) patch.budget = "mid";
  else if (/1500|2000|2400|旗舰|最好|不差钱|colorsoft|scribe/.test(text)) patch.budget = "high";

  // ── 使用场景信号 ───────────────────────────────────────────
  const useCaseSignals = [
    { pattern: /漫画|comics|cbz|彩色/, tag: "manga" },
    { pattern: /笔记|手写|批注|scribe/, tag: "notes" },
    { pattern: /pdf|论文|学术|工作文档/, tag: "pdf" },
    { pattern: /小说|阅读|看书|kindle unlimited/, tag: "reading" },
    { pattern: /学生|考研|备考|教材/, tag: "study" },
  ];
  const useCases = [];
  for (const { pattern, tag } of useCaseSignals) {
    if (pattern.test(text)) useCases.push(tag);
  }
  if (useCases.length > 0) patch.useCaseHints = useCases;

  // ── 功能需求信号 ───────────────────────────────────────────
  if (/防水|游泳|浴室|下雨/.test(text)) patch.needWaterproof = true;
  if (/彩色|colorsoft|漫画|配色/.test(text)) patch.needColor = true;
  if (/手写|触控笔|笔记|scribe|stylus/.test(text)) patch.needStylus = true;

  // ── 技术水平信号 ───────────────────────────────────────────
  if (/越狱|jailbreak|koreader|calibre|firmware|固件|sideload|侧载/.test(text)) {
    patch.techLevel = "advanced";
  } else if (/怎么|如何|步骤|教程|第一次|新手/.test(text)) {
    patch.techLevel = "beginner";
  }

  // ── 型号偏好信号 ───────────────────────────────────────────
  const seriesSignals = [
    { pattern: /paperwhite|pw/, tag: "paperwhite" },
    { pattern: /colorsoft/, tag: "colorsoft" },
    { pattern: /scribe/, tag: "scribe" },
    { pattern: /oasis/, tag: "oasis" },
    { pattern: /基础款|入门款/, tag: "basic" },
  ];
  const series = [];
  for (const { pattern, tag } of seriesSignals) {
    if (pattern.test(text)) series.push(tag);
  }
  if (series.length > 0) patch.seriesHints = series;

  // ── 话题关键词（用于历史记录）──────────────────────────────
  patch.topicKeywords = text.split(/\s+/).filter(w => w.length > 1).slice(0, 5);

  return patch;
}

/**
 * 将新信号合并进现有画像（累积式，不覆盖已有信息）
 * @param {UserProfile} current
 * @param {object} patch  extractPreferencesFromMessage 的返回值
 * @returns {UserProfile}
 */
function mergeProfile(current, patch) {
  const updated = { ...current };

  // 预算：有新信号才更新
  if (patch.budget) updated.budget = patch.budget;

  // 使用场景：累积去重
  if (patch.useCaseHints?.length) {
    updated.useCase = [...new Set([...updated.useCase, ...patch.useCaseHints])];
  }

  // 功能需求：一旦为 true 就保持
  if (patch.needWaterproof) updated.needWaterproof = true;
  if (patch.needColor) updated.needColor = true;
  if (patch.needStylus) updated.needStylus = true;

  // 技术水平：只允许升级（beginner → intermediate → advanced）
  const levelOrder = ["beginner", "intermediate", "advanced"];
  if (patch.techLevel) {
    const currentIdx = levelOrder.indexOf(updated.techLevel);
    const newIdx = levelOrder.indexOf(patch.techLevel);
    if (newIdx > currentIdx) updated.techLevel = patch.techLevel;
  }

  // 型号偏好：累积去重
  if (patch.seriesHints?.length) {
    updated.preferredSeries = [...new Set([...updated.preferredSeries, ...patch.seriesHints])];
  }

  // 话题历史：保留最近 20 条
  if (patch.topicKeywords?.length) {
    updated.topicHistory = [...patch.topicKeywords, ...updated.topicHistory].slice(0, 20);
  }

  // 计数
  updated.messageCount = (updated.messageCount || 0) + 1;

  return updated;
}

/**
 * 根据用户画像生成个性化推荐
 * 当知识库关键词匹配失败时调用
 * @param {UserProfile} profile
 * @param {object} kb  Kindle 知识库
 * @returns {{ reply: string|null, recommendedModel: string|null }}
 */
function buildPersonalizedRecommendation(profile, kb) {
  // 画像信息不足，无法推荐
  if (!profile.budget && !profile.useCase.length && !profile.needColor && !profile.needStylus) {
    return { reply: null, recommendedModel: null };
  }

  const scenarios = kb.buying_guide?.scenarios || [];
  let best = null;
  let bestScore = 0;

  for (const item of scenarios) {
    const corpus = normalize(`${item.need} ${item.recommendation} ${item.reason}`);
    let score = 0;

    // 预算匹配
    if (profile.budget === "low" && (corpus.includes("价格最低") || corpus.includes("便宜") || corpus.includes("入门"))) score += 3;
    if (profile.budget === "mid" && corpus.includes("性价比")) score += 3;
    if (profile.budget === "high" && (corpus.includes("旗舰") || corpus.includes("colorsoft") || corpus.includes("scribe"))) score += 3;

    // 场景匹配
    if (profile.useCase.includes("manga") && (corpus.includes("漫画") || corpus.includes("彩色"))) score += 3;
    if (profile.useCase.includes("notes") && (corpus.includes("笔记") || corpus.includes("手写"))) score += 3;
    if (profile.useCase.includes("study") && corpus.includes("学生")) score += 2;
    if (profile.useCase.includes("reading") && corpus.includes("阅读")) score += 2;

    // 功能需求匹配
    if (profile.needWaterproof && corpus.includes("防水")) score += 2;
    if (profile.needColor && corpus.includes("彩色")) score += 2;
    if (profile.needStylus && (corpus.includes("手写") || corpus.includes("笔记"))) score += 2;

    if (score > bestScore) { best = item; bestScore = score; }
  }

  if (!best || bestScore < 2) return { reply: null, recommendedModel: null };

  // 构建个性化前言（告诉用户我是根据他的偏好推荐的）
  const profileSummaryParts = [];
  if (profile.budget === "low") profileSummaryParts.push("预算有限");
  else if (profile.budget === "mid") profileSummaryParts.push("中等预算");
  else if (profile.budget === "high") profileSummaryParts.push("不限预算");

  const useCaseMap = { manga: "看漫画", notes: "做笔记", pdf: "看PDF", reading: "纯阅读", study: "学习备考" };
  const useCaseLabels = profile.useCase.map(u => useCaseMap[u]).filter(Boolean);
  if (useCaseLabels.length) profileSummaryParts.push(`主要用于${useCaseLabels.join("和")}`);

  if (profile.needWaterproof) profileSummaryParts.push("需要防水");
  if (profile.needColor) profileSummaryParts.push("想要彩色屏");
  if (profile.needStylus) profileSummaryParts.push("需要手写笔");

  const intro = profileSummaryParts.length > 0
    ? `根据你之前提到的（${profileSummaryParts.join("、")}），`
    : "";

  const reply = `${intro}我推荐 **${best.recommendation}**。\n\n${best.reason}`;

  return { reply, recommendedModel: best.recommendation };
}

/**
 * 根据画像构建注入 DeepSeek 的个性化 system 补丁
 * @param {UserProfile} profile
 * @returns {string}
 */
function buildProfileContext(profile) {
  if (profile.messageCount === 0) return "";

  const lines = ["【用户画像（根据历史对话自动提取，请结合这些信息给出更个性化的回答）】"];

  if (profile.budget) {
    const budgetLabel = { low: "入门预算（¥600 以内）", mid: "中等预算（¥600–1200）", high: "高端预算（¥1200+）" };
    lines.push(`- 预算倾向：${budgetLabel[profile.budget] || profile.budget}`);
  }

  if (profile.useCase.length) {
    const useCaseMap = { manga: "看漫画", notes: "做笔记", pdf: "看PDF", reading: "纯阅读", study: "学习备考" };
    lines.push(`- 主要用途：${profile.useCase.map(u => useCaseMap[u] || u).join("、")}`);
  }

  const features = [];
  if (profile.needWaterproof) features.push("防水");
  if (profile.needColor) features.push("彩色屏");
  if (profile.needStylus) features.push("手写笔");
  if (features.length) lines.push(`- 特别关注：${features.join("、")}`);

  if (profile.preferredSeries.length) {
    lines.push(`- 曾询问过的系列：${profile.preferredSeries.join("、")}`);
  }

  const techLabel = { beginner: "新手（请用通俗语言）", intermediate: "普通用户", advanced: "资深用户（可使用专业术语）" };
  lines.push(`- 技术水平：${techLabel[profile.techLevel] || profile.techLevel}`);

  if (profile.messageCount > 1) {
    lines.push(`- 本次是第 ${profile.messageCount} 次对话`);
  }

  if (profile.lastRecommendation) {
    lines.push(`- 上次推荐过：${profile.lastRecommendation}`);
  }

  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// Route Handler
// ════════════════════════════════════════════════════════════

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessage = messages[messages.length - 1]?.content || "";
    const visitorId = body.visitorId || "";

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "缺少用户消息内容" }), { status: 400 });
    }

    // ── 记忆：读取 → 提取 → 合并 → 写入 ────────────────────
    const currentProfile = await getUserProfile(visitorId);
    const preferencePatch = extractPreferencesFromMessage(userMessage);
    const updatedProfile = mergeProfile(currentProfile, preferencePatch);
    // 注意：saveUserProfile 是异步的，但我们不阻塞主流程
    // 用 fire-and-forget，如果失败不影响回复
    saveUserProfile(visitorId, updatedProfile).catch(err =>
      console.error("[Memory] 写入失败:", err.message)
    );

    // ── 意图识别 → 本地知识库路由 ───────────────────────────
    const intent = detectIntent(userMessage);
    let localReply = null;

    if (intent === INTENTS.COLOR_INFO) {
      localReply = handleColorQuery(userMessage, kb);
    } else if (intent === INTENTS.RECOMMEND) {
      localReply = handleRecommendQuery(userMessage, kb);

      // 知识库关键词未命中 → 用用户画像做个性化推荐
      if (!localReply) {
        const personalized = buildPersonalizedRecommendation(updatedProfile, kb);
        if (personalized?.reply) {
          localReply = personalized.reply;
          updatedProfile.lastRecommendation = personalized.recommendedModel || "";
          saveUserProfile(visitorId, updatedProfile).catch(() => {});
        }
      }
    } else if (intent === INTENTS.TUTORIAL) {
      localReply = handleTutorialQuery(userMessage, kb);
    } else if (intent === INTENTS.FORMAT) {
      localReply = handleFormatQuery(userMessage, kb);
    } else if (intent === INTENTS.COMPARE) {
      localReply = handleCompareQuery(userMessage, kb);
    } else if (intent === INTENTS.MODEL_INFO) {
      localReply = handleModelQuery(userMessage, kb);
    } else {
      const hits = localSearch(userMessage);
      if (hits.length > 0 && hits[0].score >= 1) {
        localReply = generateAnswer(hits[0]);
      }
    }

    // ── 本地命中：直接返回，不消耗 DeepSeek Token ───────────
    if (localReply) {
      return new Response(
        JSON.stringify({ reply: localReply, source: "local", intent, profile: updatedProfile }),
        { status: 200 }
      );
    }

    // ── 未命中：调用 DeepSeek，注入用户画像作为 context ─────
    const profileContext = buildProfileContext(updatedProfile);

    const systemContent = `你是 All of Kindle 网站的专业 Kindle 助手。
优先回答 Kindle 选购、使用、型号区别、格式支持、阅读建议等问题。
回答简洁清晰，避免空话。

${profileContext}

当用户询问推荐类问题时，请结合以上历史偏好给出更个性化的建议。
如果画像信息不足，可以主动询问用户的预算和使用场景。`;

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
        temperature: 0.7,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return new Response(JSON.stringify(data), { status: upstream.status });
    }

    const reply = data?.choices?.[0]?.message?.content || "暂无回答";

    return new Response(
      JSON.stringify({ reply, source: "deepseek", intent, profile: updatedProfile }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[route] 处理失败:", error);
    return new Response(
      JSON.stringify({ error: error.message || "服务器错误" }),
      { status: 500 }
    );
  }
}

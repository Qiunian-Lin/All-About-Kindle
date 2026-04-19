// app/api/chat/route.js
// ─────────────────────────────────────────────────────────────
// All of Kindle — 语义检索升级版
// 架构：统一评分引擎 → 动态回答生成 → 画像增强 → DeepSeek 兜底
// ─────────────────────────────────────────────────────────────

import { promises as fs } from "fs";
import path from "path";
import kb from "@/data/kindle.json";

// ════════════════════════════════════════════════════════════
// § 1  基础工具
// ════════════════════════════════════════════════════════════

function norm(text) {
  return String(text ?? "").toLowerCase().trim();
}

/** 把文本切成 token 集合（英文词 + 中文 bi-gram + 单字），提升模糊匹配覆盖率 */
function tokenize(text) {
  const t = norm(text);
  const tokens = new Set();
  // 英文/数字词按非字母数字切
  t.split(/[^\w\u4e00-\u9fa5]+/).filter(Boolean).forEach((w) => tokens.add(w));
  // 中文字符：bi-gram + 单字
  for (let i = 0; i < t.length; i++) {
    if (/[\u4e00-\u9fa5]/.test(t[i])) {
      tokens.add(t[i]);
      if (i + 1 < t.length) tokens.add(t.slice(i, i + 2));
    }
  }
  return tokens;
}

// ════════════════════════════════════════════════════════════
// § 2  同义词 / 别名扩展表（大幅扩充）
// ════════════════════════════════════════════════════════════

const SYNONYM_MAP = {
  // 型号别名
  pw: "paperwhite",
  pw12: "paperwhite",
  旗舰款: "oasis",
  高端款: "oasis",
  老旗舰: "oasis",
  翻页键款: "oasis",
  彩色款: "colorsoft",
  彩屏: "colorsoft",
  彩色屏: "colorsoft",
  写字板: "scribe",
  手写板: "scribe",
  大屏款: "scribe",
  入门款: "基础版",
  基础款: "基础版",
  最便宜: "基础版",
  最低端: "基础版",
  se版: "signature edition",
  签名版: "signature edition",
  无线充版: "signature edition",
  // 功能别名
  护眼: "暖光",
  暖色: "暖光",
  黄光: "暖光",
  色温: "暖光",
  漏水: "防水",
  ipx8: "防水",
  ipx7: "防水",
  游泳: "防水",
  浴室: "防水",
  下雨: "防水",
  传书: "发送",
  推送: "发送",
  导入: "发送",
  侧载: "sideload",
  越狱: "jailbreak",
  手写笔: "触控笔",
  stylus: "触控笔",
  // 预算别名
  划算: "性价比",
  便宜: "入门",
  省钱: "入门",
  不贵: "入门",
  学生党: "学生",
  穷学生: "学生",
  贵: "高端",
  土豪: "高端",
  不差钱: "高端",
  最好的: "高端",
  // 内容类型别名
  看漫画: "漫画",
  日漫: "漫画",
  美漫: "漫画",
  cbz: "漫画",
  cbr: "漫画",
  小说: "阅读",
  文学: "阅读",
  看书: "阅读",
  读书: "阅读",
  电子书: "阅读",
  论文: "pdf",
  教材: "pdf",
  学术: "pdf",
  学习资料: "pdf",
  做笔记: "手写",
  记笔记: "手写",
  批注: "手写",
  标注: "手写",
  // 操作别名
  格式转换: "calibre",
  书库管理: "calibre",
  电子书管理: "calibre",
  发邮件: "邮件发送",
  邮箱发送: "邮件发送",
  usb传输: "usb",
  数据线: "usb",
};

function expandQuery(raw) {
  let text = norm(raw);
  for (const [alias, canonical] of Object.entries(SYNONYM_MAP)) {
    text = text.replaceAll(norm(alias), norm(canonical));
  }
  return text;
}

// ════════════════════════════════════════════════════════════
// § 3  多标签意图识别（一次提取全部意图）
// ════════════════════════════════════════════════════════════

const INTENT_PATTERNS = [
  { id: "recommend", patterns: [/推荐|哪款|哪个好|买哪|怎么选|适合我|该买|选哪|性价比|值得买|入手|剁手/] },
  { id: "compare",   patterns: [/对比|区别|和.*区别|vs|差异|相比|比较/] },
  { id: "model_info",patterns: [/paperwhite|colorsoft|scribe|oasis|voyage|基础版|入门款|旗舰|参数|规格|多少钱|价格|重量|续航|存储|屏幕/] },
  { id: "tutorial",  patterns: [/怎么|如何|教程|步骤|操作|发送|传书|推送|设置|安装|激活|注册|登录|初始化/] },
  { id: "format",    patterns: [/格式|epub|mobi|azw3|kfx|cbz|cbr|pdf|txt|docx|支持.*格式|能.*看/] },
  { id: "faq",       patterns: [/中文|应用|app|有声书|图书馆|借阅|固件|更新|屏幕碎|坏了|查.*型号|误触|锁屏|广告/] },
  { id: "color",     patterns: [/颜色|配色|抹茶|绿色|黑色|树莓|玉绿|香槟|金色|什么颜色/] },
  { id: "sideload",  patterns: [/calibre|sideload|侧载|usb.*传|传.*usb|本地.*书|自己.*书/] },
  { id: "budget",    patterns: [/预算|多少钱|元|块钱|500|600|700|800|900|1000|1500|2000/] },
  { id: "usecase",   patterns: [/漫画|小说|论文|pdf|教材|笔记|手写|学生|学习|通勤|旅行|睡前/] },
];

function detectIntents(rawText) {
  const text = expandQuery(rawText);
  const hits = INTENT_PATTERNS.filter(({ patterns }) => patterns.some((p) => p.test(text))).map(({ id }) => id);
  return hits.length ? hits : ["general"];
}

// ════════════════════════════════════════════════════════════
// § 4  知识库索引构建（模块加载时执行一次）
// ════════════════════════════════════════════════════════════

function buildIndex(kb) {
  const index = [];

  // FAQ
  (kb.faq ?? []).forEach((item) => {
    index.push({
      type: "faq",
      searchText: norm(`${item.q} ${item.a}`),
      data: item,
      intentTags: ["faq", "general"],
    });
  });

  // 型号（把所有可用字段都编入索引）
  (kb.models ?? []).forEach((m) => {
    const priceStr = m.price_cny_approx ?? "";
    const priceUsd = m.price_usd ? Object.values(m.price_usd).map(String).join(" ") : "";
    index.push({
      type: "model",
      searchText: norm(
        [
          m.id, m.name, m.series, m.generation, m.released, m.status, m.best_for,
          priceStr, priceUsd,
          ...(m.colors ?? []),
          ...(m.highlights ?? []),
          ...(m.not_included ?? []),
          JSON.stringify(m.display ?? {}),
          (m.storage_gb ?? []).join(" "),
          m.waterproof_ipx ?? "",
        ].join(" ")
      ),
      data: m,
      intentTags: ["model_info", "recommend", "compare"],
    });
  });

  // 购买建议
  (kb.buying_guide?.scenarios ?? []).forEach((item) => {
    index.push({
      type: "guide",
      searchText: norm(`${item.need} ${item.recommendation} ${item.reason}`),
      data: item,
      intentTags: ["recommend", "budget", "usecase"],
    });
  });

  // 教程（扁平化）
  Object.entries(kb.tutorials ?? {}).forEach(([groupKey, group]) => {
    if (!Array.isArray(group)) return;
    group.forEach((item) => {
      const fullText = [
        item.title ?? "",
        item.content ?? "",
        ...(item.steps ?? []),
        ...(item.methods ?? []).map((m) => `${m.name} ${(m.steps ?? []).join(" ")}`),
      ].join(" ");
      index.push({
        type: "tutorial",
        searchText: norm(fullText),
        data: item,
        intentTags: ["tutorial", "sideload", "format"],
        groupKey,
      });
    });
  });

  // 格式支持
  ["native_supported", "via_conversion", "not_supported"].forEach((groupKey) => {
    (kb.formats?.[groupKey] ?? []).forEach((item) => {
      index.push({
        type: "format",
        searchText: norm(`${item.format} ${item.notes ?? ""}`),
        data: { ...item, group: groupKey },
        intentTags: ["format"],
      });
    });
  });

  return index;
}

const INDEX = buildIndex(kb);

// ════════════════════════════════════════════════════════════
// § 5  统一语义评分引擎
// ════════════════════════════════════════════════════════════

/**
 * 评分维度：
 *  A. 意图标签匹配     +3 / 命中意图
 *  B. token 精确匹配   +2 / token（长度 ≥ 2）
 *  C. 型号/系列名直接命中 +4~6（强信号）
 *  D. 预算数字区间匹配 +3
 *  E. guide 块意图加权 +2
 */
function scoreBlocks(expandedQuery, intents) {
  const queryTokens = tokenize(expandedQuery);
  const budgetNums = (expandedQuery.match(/\d{3,5}/g) ?? []).map(Number);

  return INDEX.map((block) => {
    let score = 0;

    // A. 意图标签
    for (const intent of intents) {
      if (block.intentTags.includes(intent)) score += 3;
    }

    // B. token 匹配
    for (const tok of queryTokens) {
      if (tok.length >= 2 && block.searchText.includes(tok)) score += 2;
    }

    // C. 型号强信号
    if (block.type === "model") {
      const m = block.data;
      if (expandedQuery.includes(norm(m.name))) score += 6;
      if (expandedQuery.includes(norm(m.series))) score += 4;
      if (m.id && expandedQuery.includes(norm(m.id))) score += 4;
      if (expandedQuery.includes("2024") && block.searchText.includes("2024")) score += 2;
      if (expandedQuery.includes("2025") && block.searchText.includes("2025")) score += 2;
    }

    // D. 预算数字区间
    if (block.type === "model" && budgetNums.length) {
      const m = block.data;
      const priceCny = parseFloat((m.price_cny_approx ?? "").replace(/[^\d.]/g, "")) || 0;
      const priceUsdMin = m.price_usd ? Math.min(...Object.values(m.price_usd)) : 0;
      for (const budget of budgetNums) {
        if (priceCny > 0 && Math.abs(priceCny - budget) < 200) score += 3;
        if (priceUsdMin > 0 && Math.abs(priceUsdMin - budget) < 50) score += 3;
      }
    }

    // E. guide 加权
    if (block.type === "guide") {
      if (intents.includes("recommend")) score += 2;
      if (intents.includes("budget") && block.searchText.includes("价格")) score += 2;
      if (intents.includes("usecase")) score += 1;
    }

    return { ...block, score };
  })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ════════════════════════════════════════════════════════════
// § 6  动态回答生成
// ════════════════════════════════════════════════════════════

function fmtPrice(m) {
  if (m.price_cny_approx) return m.price_cny_approx;
  if (m.price_usd) return `约 $${Math.min(...Object.values(m.price_usd))} 起`;
  return "价格未知";
}

function summarizeModel(m, { compact = false } = {}) {
  const d = m.display ?? {};
  const lines = [`**${m.name}**（${m.generation ?? m.released}）`];
  lines.push(`💰 ${fmtPrice(m)}`);
  if (!compact) {
    lines.push(`📱 ${d.size_inch ?? "?"}英寸 · ${d.resolution_ppi ?? "?"}ppi${d.color ? " · **彩色**" : ""}${d.front_light ? " · 前灯" : ""}`);
    lines.push(`💾 ${(m.storage_gb ?? []).join("/")}GB  🛡️ 防水：${m.waterproof_ipx ?? "无"}  ⚖️ ${m.weight_g ?? "?"}g`);
  }
  if (m.highlights?.length) lines.push(`✨ ${m.highlights.slice(0, 3).join("、")}`);
  if (m.best_for) lines.push(`👤 ${m.best_for}`);
  if (!compact && m.not_included?.length) lines.push(`❌ 无：${m.not_included.slice(0, 3).join("、")}`);
  return lines.join("\n");
}

function generateAnswer(topBlocks, intents, rawQuery, profile) {
  if (!topBlocks.length) return null;

  const expandedQ = expandQuery(rawQuery);
  const top = topBlocks[0];
  const top5 = topBlocks.slice(0, 5);

  // ── 颜色查询 ─────────────────────────────────────────────
  if (intents.includes("color")) {
    const mb = top5.find((b) => b.type === "model");
    if (mb) {
      const colors = mb.data.colors ?? [];
      if (colors.length) return `**${mb.data.name}** 提供以下配色：\n${colors.map((c) => `• ${c}`).join("\n")}`;
    }
  }

  // ── 格式查询 ─────────────────────────────────────────────
  if (intents.includes("format")) {
    const fmtBlocks = top5.filter((b) => b.type === "format");
    if (fmtBlocks.length) {
      const groupLabel = { native_supported: "✅ 原生支持", via_conversion: "🔄 需转换", not_supported: "❌ 不支持" };
      return fmtBlocks.map((b) => `**${b.data.format}** — ${groupLabel[b.data.group] ?? b.data.group}\n${b.data.notes ?? ""}`).join("\n\n");
    }
    // 泛问格式
    if (/格式|支持/.test(expandedQ)) {
      const fmt = kb.formats ?? {};
      return `Kindle 格式支持一览：

**✅ 原生支持**
${(fmt.native_supported ?? []).map((x) => `• **${x.format}**：${x.notes ?? ""}`).join("\n")}

**🔄 转换后支持**
${(fmt.via_conversion ?? []).map((x) => `• **${x.format}**：${x.notes ?? ""}`).join("\n")}

**❌ 不支持（需借助第三方工具）**
${(fmt.not_supported ?? []).map((x) => `• **${x.format}**：${x.notes ?? ""}`).join("\n")}`;
    }
  }

  // ── FAQ ──────────────────────────────────────────────────
  if (intents.includes("faq") && top.type === "faq" && top.score >= 4) {
    return top.data.a;
  }

  // ── 对比查询 ─────────────────────────────────────────────
  if (intents.includes("compare")) {
    const modelBlocks = top5.filter((b) => b.type === "model");
    if (modelBlocks.length >= 2) {
      const [a, b] = modelBlocks.map((bl) => bl.data);
      const da = a.display ?? {}, db = b.display ?? {};
      return `**${a.name}** vs **${b.name}**

| 维度 | ${a.name} | ${b.name} |
|------|----------|----------|
| 屏幕 | ${da.size_inch}"·${da.resolution_ppi}ppi${da.color ? "·彩色" : ""} | ${db.size_inch}"·${db.resolution_ppi}ppi${db.color ? "·彩色" : ""} |
| 存储 | ${(a.storage_gb ?? []).join("/")}GB | ${(b.storage_gb ?? []).join("/")}GB |
| 防水 | ${a.waterproof_ipx ?? "无"} | ${b.waterproof_ipx ?? "无"} |
| 重量 | ${a.weight_g ?? "?"}g | ${b.weight_g ?? "?"}g |
| 价格 | ${fmtPrice(a)} | ${fmtPrice(b)} |

**${a.name}** 适合：${a.best_for ?? "暂无"}
**${b.name}** 适合：${b.best_for ?? "暂无"}`;
    }
    // 只命中一个型号
    if (modelBlocks.length === 1) return summarizeModel(modelBlocks[0].data);
  }

  // ── 推荐查询（含预算/场景）────────────────────────────────
  if (intents.some((i) => ["recommend", "budget", "usecase"].includes(i))) {
    const guideBlocks = top5.filter((b) => b.type === "guide");

    // 用画像对 guide 再加分
    const scoredGuides = guideBlocks.map((g) => {
      let bonus = 0;
      const corpus = `${g.data.need} ${g.data.reason}`;
      if (profile.budget === "low" && /入门|便宜|价格最低/.test(corpus)) bonus += 4;
      if (profile.budget === "mid" && /性价比|主力/.test(corpus)) bonus += 4;
      if (profile.budget === "high" && /旗舰|彩色|scribe/.test(corpus)) bonus += 4;
      if (profile.useCase.includes("manga") && /漫画|彩色/.test(corpus)) bonus += 3;
      if (profile.useCase.includes("notes") && /笔记|手写/.test(corpus)) bonus += 3;
      if (profile.useCase.includes("pdf") && /pdf/.test(corpus)) bonus += 3;
      if (profile.useCase.includes("study") && /学生/.test(corpus)) bonus += 3;
      if (profile.needWaterproof && /防水/.test(corpus)) bonus += 3;
      if (profile.needColor && /彩色/.test(corpus)) bonus += 3;
      if (profile.needStylus && /手写|笔记/.test(corpus)) bonus += 3;
      return { ...g, score: g.score + bonus };
    }).sort((a, b) => b.score - a.score);

    const bestGuide = scoredGuides[0];
    if (bestGuide && bestGuide.score >= 3) {
      const recName = norm(bestGuide.data.recommendation).slice(0, 8);
      const matchedModel = topBlocks.find(
        (b) => b.type === "model" && norm(b.data.name).includes(recName)
      );

      // 构建个性化前言
      const hints = [];
      const um = { manga: "看漫画", notes: "做笔记", pdf: "看PDF", reading: "纯阅读", study: "学习备考" };
      if (profile.budget === "low") hints.push("入门预算");
      if (profile.budget === "mid") hints.push("中等预算");
      if (profile.budget === "high") hints.push("高端预算");
      profile.useCase.forEach((u) => { if (um[u]) hints.push(um[u]); });
      if (profile.needWaterproof) hints.push("需防水");
      if (profile.needColor) hints.push("想要彩色");
      if (profile.needStylus) hints.push("需手写笔");

      const intro = hints.length ? `根据你提到的「${hints.join("·")}」，` : "";
      let reply = `${intro}推荐 **${bestGuide.data.recommendation}**。\n\n${bestGuide.data.reason}`;
      if (matchedModel) reply += `\n\n---\n${summarizeModel(matchedModel.data, { compact: true })}`;
      return reply;
    }

    // guide 命中不足 → 直接列出最相关型号
    const modelCands = top5.filter((b) => b.type === "model");
    if (modelCands.length) {
      return modelCands.slice(0, 2).map((b) => summarizeModel(b.data, { compact: true })).join("\n\n---\n\n");
    }
  }

  // ── 教程查询 ─────────────────────────────────────────────
  if (intents.some((i) => ["tutorial", "sideload"].includes(i))) {
    const tutBlocks = top5.filter((b) => b.type === "tutorial");
    if (tutBlocks.length && tutBlocks[0].score >= 3) {
      const t = tutBlocks[0].data;
      const lines = [`**${t.title}**`];
      if (t.steps?.length) {
        lines.push(t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
      } else if (t.methods?.length) {
        t.methods.forEach((m) => {
          lines.push(`\n**${m.name}**`);
          (m.steps ?? []).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
        });
      } else if (t.content) {
        lines.push(t.content);
      }
      return lines.join("\n");
    }
  }

  // ── 单型号详情 ────────────────────────────────────────────
  if (intents.includes("model_info")) {
    const mb = top5.find((b) => b.type === "model");
    if (mb && mb.score >= 4) return summarizeModel(mb.data);
  }

  // ── 通用 FAQ 兜底 ─────────────────────────────────────────
  if (top.type === "faq" && top.score >= 3) return top.data.a;

  // ── 分数低但有型号命中 ────────────────────────────────────
  if (top.score >= 2 && top.type === "model") return summarizeModel(top.data, { compact: true });

  return null; // 交给 DeepSeek
}

// ════════════════════════════════════════════════════════════
// § 7  用户记忆系统
// ════════════════════════════════════════════════════════════

const MEMORY_FILE = path.join(process.cwd(), "data", "user-memory.json");

async function readMemoryStore() {
  try { return JSON.parse(await fs.readFile(MEMORY_FILE, "utf-8")); }
  catch { return {}; }
}
async function writeMemoryStore(store) {
  await fs.writeFile(MEMORY_FILE, JSON.stringify(store, null, 2), "utf-8");
}
async function getUserProfile(visitorId) {
  if (!visitorId) return createEmptyProfile();
  return (await readMemoryStore())[visitorId] ?? createEmptyProfile();
}
async function saveUserProfile(visitorId, profile) {
  if (!visitorId) return;
  const store = await readMemoryStore();
  store[visitorId] = { ...profile, updatedAt: Date.now() };
  await writeMemoryStore(store);
}

function createEmptyProfile() {
  return {
    budget: null, useCase: [], preferredSeries: [],
    needWaterproof: false, needColor: false, needStylus: false,
    techLevel: "beginner", topicHistory: [], messageCount: 0,
    lastRecommendation: null, lastIntent: null,
    firstSeenAt: Date.now(), updatedAt: Date.now(),
  };
}

function extractPreferencesFromMessage(message) {
  const text = norm(message);
  const patch = {};
  if (/500|600|558|入门|便宜|最低|不贵/.test(text)) patch.budget = "low";
  else if (/800|900|1000|1058|858|性价比|适中/.test(text)) patch.budget = "mid";
  else if (/1500|2000|2400|旗舰|不差钱|colorsoft|scribe/.test(text)) patch.budget = "high";

  const uc = [
    { p: /漫画|comics|cbz|cbr|彩色/, t: "manga" },
    { p: /笔记|手写|批注|scribe/, t: "notes" },
    { p: /pdf|论文|学术|教材/, t: "pdf" },
    { p: /小说|阅读|看书|kindle unlimited/, t: "reading" },
    { p: /学生|考研|备考/, t: "study" },
  ].filter(({ p }) => p.test(text)).map(({ t }) => t);
  if (uc.length) patch.useCaseHints = uc;

  if (/防水|游泳|浴室|下雨/.test(text)) patch.needWaterproof = true;
  if (/彩色|colorsoft|漫画|配色/.test(text)) patch.needColor = true;
  if (/手写|触控笔|笔记|scribe|stylus/.test(text)) patch.needStylus = true;

  if (/越狱|jailbreak|koreader|calibre|firmware|固件|sideload/.test(text)) patch.techLevel = "advanced";
  else if (/怎么|如何|步骤|教程|第一次|新手/.test(text)) patch.techLevel = "beginner";

  const ss = [
    { p: /paperwhite|pw/, t: "paperwhite" }, { p: /colorsoft/, t: "colorsoft" },
    { p: /scribe/, t: "scribe" }, { p: /oasis/, t: "oasis" },
    { p: /基础款|入门款/, t: "basic" },
  ].filter(({ p }) => p.test(text)).map(({ t }) => t);
  if (ss.length) patch.seriesHints = ss;

  patch.topicKeywords = text.split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
  return patch;
}

function mergeProfile(current, patch) {
  const u = { ...current };
  if (patch.budget) u.budget = patch.budget;
  if (patch.useCaseHints?.length) u.useCase = [...new Set([...(u.useCase ?? []), ...patch.useCaseHints])];
  if (patch.needWaterproof) u.needWaterproof = true;
  if (patch.needColor) u.needColor = true;
  if (patch.needStylus) u.needStylus = true;
  const lo = ["beginner", "intermediate", "advanced"];
  if (patch.techLevel && lo.indexOf(patch.techLevel) > lo.indexOf(u.techLevel)) u.techLevel = patch.techLevel;
  if (patch.seriesHints?.length) u.preferredSeries = [...new Set([...(u.preferredSeries ?? []), ...patch.seriesHints])];
  if (patch.topicKeywords?.length) u.topicHistory = [...patch.topicKeywords, ...(u.topicHistory ?? [])].slice(0, 20);
  u.messageCount = (u.messageCount ?? 0) + 1;
  return u;
}

function buildProfileContext(profile) {
  if (!profile || profile.messageCount === 0) return "";
  const lines = ["【用户画像（请结合以下信息给出更个性化的回答）】"];
  if (profile.budget) {
    const bl = { low: "入门预算（¥600内）", mid: "中等预算（¥600–1200）", high: "高端预算（¥1200+）" };
    lines.push(`- 预算：${bl[profile.budget] ?? profile.budget}`);
  }
  if (profile.useCase?.length) {
    const um = { manga: "看漫画", notes: "做笔记", pdf: "看PDF", reading: "纯阅读", study: "学习备考" };
    lines.push(`- 用途：${profile.useCase.map((u) => um[u] ?? u).join("、")}`);
  }
  const feats = [profile.needWaterproof && "防水", profile.needColor && "彩色屏", profile.needStylus && "手写笔"].filter(Boolean);
  if (feats.length) lines.push(`- 关注：${feats.join("、")}`);
  if (profile.preferredSeries?.length) lines.push(`- 询问系列：${profile.preferredSeries.join("、")}`);
  const tl = { beginner: "新手（请通俗）", intermediate: "普通用户", advanced: "资深用户（可用专业术语）" };
  lines.push(`- 技术水平：${tl[profile.techLevel] ?? profile.techLevel}`);
  if (profile.messageCount > 1) lines.push(`- 第 ${profile.messageCount} 次对话`);
  if (profile.lastRecommendation) lines.push(`- 上次推荐：${profile.lastRecommendation}`);
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// § 8  Route Handler
// ════════════════════════════════════════════════════════════

const LOCAL_SCORE_THRESHOLD = 5; // 低于此值走 DeepSeek

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessage = messages[messages.length - 1]?.content ?? "";
    const visitorId = body.visitorId ?? "";

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "缺少用户消息内容" }), { status: 400 });
    }

    // ── 画像更新（异步写入，不阻塞回复） ────────────────────
    const currentProfile = await getUserProfile(visitorId);
    const patch = extractPreferencesFromMessage(userMessage);
    const updatedProfile = mergeProfile(currentProfile, patch);
    saveUserProfile(visitorId, updatedProfile).catch((e) =>
      console.error("[Memory] 写入失败:", e.message)
    );

    // ── 语义检索 + 评分 ──────────────────────────────────────
    const intents = detectIntents(userMessage);
    const expandedQ = expandQuery(userMessage);
    const scoredBlocks = scoreBlocks(expandedQ, intents);

    // ── 动态回答生成 ──────────────────────────────────────────
    let localReply = null;
    if (scoredBlocks.length && scoredBlocks[0].score >= LOCAL_SCORE_THRESHOLD) {
      localReply = generateAnswer(scoredBlocks, intents, userMessage, updatedProfile);
    }

    if (localReply) {
      return new Response(
        JSON.stringify({ reply: localReply, source: "local", intents, profile: updatedProfile }),
        { status: 200 }
      );
    }

    // ── DeepSeek 兜底（注入画像 + 知识库摘要） ───────────────
    const profileCtx = buildProfileContext(updatedProfile);
    const kbSnippets = scoredBlocks.slice(0, 2).map((b) => {
      if (b.type === "model") return `型号：${JSON.stringify(b.data).slice(0, 300)}`;
      if (b.type === "faq") return `FAQ：Q:${b.data.q}\nA:${b.data.a}`;
      if (b.type === "guide") return `推荐建议：${b.data.need} → ${b.data.recommendation}。${b.data.reason}`;
      return `参考：${b.searchText.slice(0, 200)}`;
    });

    const systemContent = `你是 All of Kindle 网站的专业 Kindle 助手，用中文回答，简洁实用，适当使用 Markdown。

${profileCtx}

${kbSnippets.length ? `【知识库摘要（优先参考）】\n${kbSnippets.join("\n\n")}` : ""}

推荐类问题请结合画像给个性化建议；信息不足时主动询问预算和使用场景。`.trim();

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: systemContent }, ...messages],
        temperature: 0.6,
        max_tokens: 800,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) return new Response(JSON.stringify(data), { status: upstream.status });

    const reply = data?.choices?.[0]?.message?.content ?? "暂无回答";
    return new Response(
      JSON.stringify({ reply, source: "deepseek", intents, profile: updatedProfile }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[route] 处理失败:", error);
    return new Response(JSON.stringify({ error: error.message ?? "服务器错误" }), { status: 500 });
  }
}

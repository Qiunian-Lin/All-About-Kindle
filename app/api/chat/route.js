import kb from "@/data/kindle.json";

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function buildChunks(kb) {
  const chunks = [];

  kb.faq?.forEach((item) => {
    chunks.push({
      type: "faq",
      text: `${item.q} ${item.a}`.toLowerCase(),
      data: item,
    });
  });

  kb.models?.forEach((m) => {
    chunks.push({
      type: "model",
      text: [
        m.name,
        m.series,
        m.generation,
        ...(m.colors || []),
        ...(m.highlights || []),
        m.best_for || "",
      ]
        .join(" ")
        .toLowerCase(),
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
        chunks.push({
          type: "tutorial",
          text: JSON.stringify(item).toLowerCase(),
          data: item,
        });
      });
    }
  });

  const formatGroups = kb.formats || {};
  Object.values(formatGroups).forEach((group) => {
    if (Array.isArray(group)) {
      group.forEach((item) => {
        chunks.push({
          type: "format",
          text: JSON.stringify(item).toLowerCase(),
          data: item,
        });
      });
    }
  });

  return chunks;
}

const chunks = buildChunks(kb);

const synonymMap = {
  护眼: "暖光",
  伤眼: "暖光",
  便宜: "性价比",
  划算: "性价比",
  高端: "旗舰",
  学生: "学生",
  学生党: "学生",
  看漫画: "漫画",
  看pdf: "pdf",
  传书: "发送",
  抹茶绿: "抹茶绿",
  玉绿: "玉绿",
  树莓红: "树莓红",
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
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(q, chunk),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);
}

function generateAnswer(hit) {
  if (hit.type === "faq") {
    return hit.data.a;
  }

  if (hit.type === "model") {
    const m = hit.data;
    return `${m.name}${m.generation ? `（${m.generation}）` : ""}
主要特点：${Array.isArray(m.highlights) ? m.highlights.join("、") : "暂无"}
配色：${Array.isArray(m.colors) ? m.colors.join("、") : "暂无"}
适合人群：${m.best_for || "暂无"}`;
  }

  if (hit.type === "guide") {
    return `推荐：${hit.data.recommendation}\n原因：${hit.data.reason}`;
  }

  if (hit.type === "tutorial") {
    if (hit.data.steps) {
      return `${hit.data.title}\n${hit.data.steps
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")}`;
    }
    if (hit.data.content) {
      return `${hit.data.title}\n${hit.data.content}`;
    }
    if (hit.data.methods) {
      return `${hit.data.title}\n${hit.data.methods
        .map((m) => `${m.name}：${(m.steps || []).join("；")}`)
        .join("\n")}`;
    }
  }

  if (hit.type === "format") {
    return `${hit.data.format}：${hit.data.notes || ""}`;
  }

  return null;
}

const INTENTS = {
  MODEL_INFO: "model_info",
  COLOR_INFO: "color_info",
  RECOMMEND: "recommend",
  TUTORIAL: "tutorial",
  FORMAT: "format",
  COMPARE: "compare",
  FAQ: "faq",
  GENERAL: "general",
};

const modelKeywords = [
  "kindle",
  "paperwhite",
  "signature edition",
  "colorsoft",
  "scribe",
  "oasis",
  "voyage",
  "基础版",
  "pw",
];

const colorKeywords = [
  "抹茶绿",
  "黑色",
  "金色",
  "灰色",
  "绿色",
  "配色",
  "颜色",
];

const recommendKeywords = [
  "推荐",
  "哪款",
  "怎么买",
  "买哪个",
  "适合我",
  "怎么选",
  "选哪个",
  "预算",
  "性价比",
  "学生",
  "漫画",
  "阅读",
];

const tutorialKeywords = [
  "怎么",
  "如何",
  "教程",
  "设置",
  "传书",
  "发送",
  "导入",
  "登录",
  "注册",
  "语言",
  "高亮",
  "书签",
  "calibre",
  "send to kindle",
  "更新固件",
];

const formatKeywords = [
  "格式",
  "epub",
  "pdf",
  "mobi",
  "azw3",
  "kfx",
  "cbz",
  "cbr",
  "docx",
  "txt",
  "支持什么格式",
];

const compareKeywords = ["对比", "区别", "哪个好", "哪一个好", "vs", "和"];

const faqKeywords = [
  "支持中文",
  "能看中文吗",
  "能看pdf吗",
  "能装应用吗",
  "有声书",
  "借阅图书馆",
  "固件",
  "屏幕碎了",
  "查型号",
  "误触",
];

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
      if (text.includes(c) || c.includes(text)) {
        return `${model.name} 提供这些配色：${colors.join("、")}。`;
      }
      if (text.includes("抹茶绿") && c.includes("抹茶绿")) {
        return `${model.name} 提供这些配色：${colors.join("、")}。`;
      }
    }
  }

  return null;
}

function handleRecommendQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  const scenarios = kb.buying_guide?.scenarios || [];

  let best = null;
  let bestScore = 0;

  for (const item of scenarios) {
    const corpus = normalize(
      `${item.need} ${item.recommendation} ${item.reason}`
    );

    let score = 0;

    if (
      (text.includes("预算") || text.includes("便宜") || text.includes("性价比")) &&
      (corpus.includes("价格最低") || corpus.includes("最便宜") || corpus.includes("性价比"))
    ) {
      score += 2;
    }

    if (text.includes("防水") && corpus.includes("防水")) score += 2;
    if ((text.includes("漫画") || text.includes("彩色")) && (corpus.includes("彩色") || corpus.includes("漫画"))) score += 2;
    if ((text.includes("笔记") || text.includes("手写")) && (corpus.includes("笔记") || corpus.includes("手写"))) score += 2;
    if (text.includes("学生") && corpus.includes("学生")) score += 2;

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (best) {
    return `推荐你选择 ${best.recommendation}。原因：${best.reason}`;
  }

  return null;
}

function flattenTutorials(tutorials) {
  const result = [];
  Object.values(tutorials || {}).forEach((group) => {
    if (Array.isArray(group)) {
      group.forEach((item) => result.push(item));
    }
  });
  return result;
}

function handleTutorialQuery(userMessage, kb) {
  const text = applySynonyms(userMessage);
  const tutorials = flattenTutorials(kb.tutorials);

  let best = null;
  let bestScore = 0;

  for (const item of tutorials) {
    const corpus = normalize(JSON.stringify(item));
    let score = 0;

    const keywords = text.split(/\s+/).filter(Boolean);
    for (const kw of keywords) {
      if (corpus.includes(kw)) score += 1;
    }

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (!best || bestScore === 0) return null;

  if (best.steps) {
    return `${best.title}\n${best.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  }

  if (best.methods) {
    return `${best.title}\n${best.methods
      .map((m) => `${m.name}：${(m.steps || []).join("；")}`)
      .join("\n")}`;
  }

  if (best.content) {
    return `${best.title}\n${best.content}`;
  }

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
    if (text.includes(normalize(item.format))) {
      return `${item.format}：${item.group}。${item.notes || ""}`;
    }
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
    return (
      text.includes(normalize(m.name)) ||
      text.includes(normalize(m.series)) ||
      corpus.includes(text)
    );
  });

  if (matched.length >= 2) {
    const [a, b] = matched.slice(0, 2);
    return `${a.name} 与 ${b.name} 的主要区别：
1. 屏幕：${JSON.stringify(a.display)} vs ${JSON.stringify(b.display)}
2. 存储：${(a.storage_gb || []).join("/")}GB vs ${(b.storage_gb || []).join("/")}GB
3. 防水：${a.waterproof_ipx || "否"} vs ${b.waterproof_ipx || "否"}
4. 适合人群：${a.best_for || "暂无"} vs ${b.best_for || "暂无"}`;
  }

  const faqHit = (kb.faq || []).find(
    (x) => text.includes(normalize(x.q)) || normalize(x.q).includes(text)
  );
  if (faqHit) return faqHit.a;

  return null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessage = messages[messages.length - 1]?.content || "";

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "缺少用户消息内容" }), {
        status: 400,
      });
    }

    const intent = detectIntent(userMessage);
    let localReply = null;

    if (intent === INTENTS.COLOR_INFO) {
      localReply = handleColorQuery(userMessage, kb);
    } else if (intent === INTENTS.RECOMMEND) {
      localReply = handleRecommendQuery(userMessage, kb);
    } else if (intent === INTENTS.TUTORIAL) {
      localReply = handleTutorialQuery(userMessage, kb);
    } else if (intent === INTENTS.FORMAT) {
      localReply = handleFormatQuery(userMessage, kb);
    } else if (intent === INTENTS.COMPARE) {
      localReply = handleCompareQuery(userMessage, kb);
    } else {
      const hits = localSearch(userMessage);
      if (hits.length > 0 && hits[0].score >= 2) {
        localReply = generateAnswer(hits[0]);
      }
    }

    if (localReply) {
      return new Response(
        JSON.stringify({
          reply: localReply,
          source: "local",
          intent,
        }),
        { status: 200 }
      );
    }

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "你是 All of Kindle 网站的专业 Kindle 助手。优先回答 Kindle 选购、使用、型号区别、格式支持、阅读建议等问题。回答简洁清晰，避免空话。",
          },
          ...messages,
        ],
        temperature: 0.7,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return new Response(JSON.stringify(data), {
        status: upstream.status,
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "暂无回答";

    return new Response(
      JSON.stringify({
        reply,
        source: "deepseek",
        intent,
      }),
      { status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "服务器错误" }),
      { status: 500 }
    );
  }
}

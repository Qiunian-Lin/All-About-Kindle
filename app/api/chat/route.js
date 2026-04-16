import kb from "@/data/kindle.json";

function buildChunks(kb) {
  const chunks = [];

  // FAQ
  kb.faq?.forEach(item => {
    chunks.push({
      type: "faq",
      text: (item.q + " " + item.a).toLowerCase(),
      data: item
    });
  });

  // 模型
  kb.models?.forEach(m => {
    chunks.push({
      type: "model",
      text: JSON.stringify(m).toLowerCase(),
      data: m
    });
  });

  // 购买指南（重点修复）
  kb.buying_guide?.scenarios?.forEach(item => {
    chunks.push({
      type: "guide",
      text: (item.need + " " + item.recommendation + " " + item.reason).toLowerCase(),
      data: item
    });
  });

  // 教程（重点修复）
  const tutorialGroups = kb.tutorials || {};

  Object.values(tutorialGroups).forEach(group => {
    group.forEach(item => {
      chunks.push({
        type: "tutorial",
        text: JSON.stringify(item).toLowerCase(),
        data: item
      });
    });
  });

  // 格式（重点修复）
  const formatGroups = kb.formats || {};

  Object.values(formatGroups).forEach(group => {
    if (Array.isArray(group)) {
      group.forEach(item => {
        chunks.push({
          type: "format",
          text: JSON.stringify(item).toLowerCase(),
          data: item
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
  学生: "入门",
  学生党: "入门",
  看漫画: "漫画",
  看pdf: "pdf",
  传书: "导入电子书",
};

function normalize(text) {
  let result = (text || "").toLowerCase();
  for (const [key, value] of Object.entries(synonymMap)) {
    result = result.replaceAll(key.toLowerCase(), value.toLowerCase());
  }
  return result;
}

function scoreChunk(query, chunk) {
  const keywords = query.split(/\s+/).filter(Boolean);
  let score = 0;

  for (const kw of keywords) {
    if (chunk.text.includes(kw)) {
      score += 1;
    }
  }

  return score;
}

function localSearch(query) {
  const normalizedQuery = normalize(query);

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(normalizedQuery, chunk),
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
    return `${m.name}${m.year ? `（${m.year}）` : ""}\n主要特点：${
      Array.isArray(m.features) ? m.features.join("、") : "暂无"
    }\n价格：${m.price || "暂无"}\n推荐理由：${
      m.desc || m.recommendation || "暂无"
    }`;
  }

  if (hit.type === "guide") {
    return typeof hit.data === "string"
      ? hit.data
      : JSON.stringify(hit.data, null, 2);
  }

  if (hit.type === "tutorial") {
    return typeof hit.data === "string"
      ? hit.data
      : JSON.stringify(hit.data, null, 2);
  }

  if (hit.type === "format") {
    return typeof hit.data === "string"
      ? hit.data
      : JSON.stringify(hit.data, null, 2);
  }

  return "已找到相关信息，但暂时无法整理为标准回答。";
}

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessage = messages[messages.length - 1]?.content || "";

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: "缺少用户消息内容" }),
        { status: 400 }
      );
    }

    // ① 先查本地知识库
    const hits = localSearch(userMessage);

    if (hits.length > 0) {
      const reply = generateAnswer(hits[0]);

      return new Response(
        JSON.stringify({
          reply,
          source: "local",
        }),
        { status: 200 }
      );
    }

    // ② 未命中，再走 DeepSeek
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

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "你是一个专业的 Kindle 助手，回答简洁清晰"
          },
          ...messages
        ],
        temperature: 0.7
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return new Response(JSON.stringify(data), {
        status: upstream.status,
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content || "暂无回答";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}

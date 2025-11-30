import OpenAI from 'openai';

// ✅ 修改：BaseURL 换成了 SiliconFlow，以支持 Qwen 视觉模型
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.siliconflow.cn/v1" 
});

export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const { messages, model, type, length } = await req.json();

    // 默认系统提示词
    let systemPrompt = "You are a helpful assistant.";
    if (type === 'ask') systemPrompt = "You are a professional translator and editor.";
    if (type === 'write') systemPrompt = `You are a professional writer. Target length: ${length || 'any'}.`;

    // 注意：如果是识图模式，有时候不加 system prompt 效果更好，或者保持简单
    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const response = await client.chat.completions.create({
      // 如果前端没传模型，默认用 DeepSeek V3
      model: model || "deepseek-ai/DeepSeek-V3",
      messages: finalMessages,
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || "";
          controller.enqueue(new TextEncoder().encode(content));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

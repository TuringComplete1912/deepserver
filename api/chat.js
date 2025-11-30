import OpenAI from 'openai';

// ✅ 必须是 SiliconFlow，否则 Qwen 和图片都无法使用！
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.siliconflow.cn/v1" 
});

export const config = { 
  runtime: 'edge',
  maxDuration: 60 
};

export default async function handler(req) {
  // 1. 跨域处理
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  try {
    const { messages, model } = await req.json();

    // 2. 修正模型名称 (防止前端传错)
    // 如果用户选了 DeepSeek V3，确保发给后端的是 SiliconFlow 认可的 ID
    let targetModel = model;
    
    // 3. 构建请求
    const response = await client.chat.completions.create({
      model: targetModel,
      messages: messages,
      stream: true,
      max_tokens: 4096,
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) controller.enqueue(new TextEncoder().encode(content));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    console.error("Backend Error:", error);
    const msg = error.error?.message || error.message || "Unknown Error";
    return new Response(JSON.stringify({ error: `[Server] ${msg}` }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
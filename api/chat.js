import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.siliconflow.cn/v1" // 确保是 SiliconFlow
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

    // 2. 关键检查：如果发了图片，必须用 VL 模型
    const hasImage = messages.some(m => Array.isArray(m.content));
    const isVisionModel = model.includes('VL'); // 检查模型名字里有没有 VL

    if (hasImage && !isVisionModel) {
      throw new Error(`Model Mismatch: You selected "${model}" but sent an image. Please switch to "Qwen2 VL".`);
    }

    // 3. 构建请求
    const response = await client.chat.completions.create({
      model: model || "deepseek-ai/DeepSeek-V3",
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
    
    // 🔥 这里把真正的错误原因返回给你
    // 如果是 API Key 错了，会显示 401
    // 如果是余额不足，会显示 Balance Insufficient
    const realErrorMessage = error.error?.message || error.message || "Unknown Error";
    
    return new Response(JSON.stringify({ 
      error: `[Server] ${realErrorMessage}` 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
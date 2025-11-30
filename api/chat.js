import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, // 确保 Vercel 里填的是 SiliconFlow 的 Key
  baseURL: "https://api.siliconflow.cn/v1" 
});

export const config = { 
  runtime: 'edge',
  maxDuration: 60 // 延长超时时间，防止传图片超时
};

export default async function handler(req) {
  // 1. 处理 OPTIONS 请求 (跨域预检，防止浏览器报 CORS 错误)
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
    const { messages, model, type, length } = await req.json();

    // 2. 智能构建 Prompt
    // 注意：Qwen-VL 视觉模型有时不喜欢 System Prompt，所以如果是图片模式，我们简化消息结构
    let finalMessages = [];

    // 检查是否有图片 (通过检查 content 是否为数组)
    const hasImage = messages.some(m => Array.isArray(m.content));

    if (!hasImage) {
      // 纯文本模式：加上 System Prompt 设定人设
      let systemPrompt = "You are a helpful assistant.";
      if (type === 'ask') systemPrompt = "You are a professional translator. Output only the result.";
      if (type === 'write') systemPrompt = `You are a professional writer. Length: ${length || 'any'}.`;
      
      finalMessages = [
        { role: "system", content: systemPrompt },
        ...messages
      ];
    } else {
      // 📷 图片模式：直接发送用户消息，减少干扰，提高成功率
      finalMessages = [...messages];
    }

    // 3. 发送请求
    const response = await client.chat.completions.create({
      model: model || "deepseek-ai/DeepSeek-V3",
      messages: finalMessages,
      stream: true,
      max_tokens: 4096, // 显式限制，防止模型输出无限长
    });

    // 4. 流式返回
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            controller.enqueue(new TextEncoder().encode(content));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 
        'Content-Type': 'text/event-stream',
        'Access-Control-Allow-Origin': '*' // 允许跨域
      },
    });

  } catch (error) {
    console.error("Backend Error Details:", error); // 这行字会出现在 Vercel Logs 里
    
    // 返回具体的错误信息给前端，而不是笼统的 500
    const errorMessage = error.error?.message || error.message || "Unknown Server Error";
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
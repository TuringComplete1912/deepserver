import OpenAI from 'openai';

// ✅ 必须使用 SiliconFlow 的配置
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, // 复用你已经配好的 SiliconFlow Key
  baseURL: "https://api.siliconflow.cn/v1"
});

export const config = {
  runtime: 'edge',
  maxDuration: 60 // 生图比较慢，延长时间防止超时
};

export default async function handler(req) {
  // 1. 跨域处理 (CORS)
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

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { prompt } = await req.json();

    if (!prompt) {
      throw new Error("Prompt is required");
    }

    console.log(`[Image Gen] Prompt: ${prompt}`);

    // 2. 调用 SiliconFlow 的 FLUX.1 模型
    // FLUX 是目前最快、效果最好的开源生图模型之一
    const response = await client.images.generate({
      model: "black-forest-labs/FLUX.1-schnell", 
      prompt: prompt,
      n: 1,
      size: "1024x1024", // 标准尺寸
      response_format: "b64_json" // 必须强制要 Base64，否则可能返回 URL 导致跨域问题
    });

    // 3. 检查结果
    const imageData = response.data[0].b64_json;
    if (!imageData) {
      throw new Error("API returned empty image data");
    }

    // 4. 返回前端
    return new Response(JSON.stringify({ 
      image: `data:image/png;base64,${imageData}`,
      status: 'success'
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error("Image Gen Error:", error);
    // 返回具体的错误原因
    const msg = error.error?.message || error.message || "Unknown Error";
    return new Response(JSON.stringify({ error: `[Server] ${msg}` }), { 
      status: 500,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }
}
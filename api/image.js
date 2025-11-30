import OpenAI from 'openai';

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
    const { prompt } = await req.json();
    if (!prompt) throw new Error("Prompt is required");

    console.log(`[Image] Generating: ${prompt}`);

    // 2. 请求 SiliconFlow (不强制要求 b64_json，让它自己决定)
    const response = await client.images.generate({
      model: "black-forest-labs/FLUX.1-schnell", 
      prompt: prompt,
      n: 1,
      size: "1024x1024", 
    });

    console.log("Raw Response:", JSON.stringify(response));

    // 3. 智能解析 (既兼容 URL 也兼容 Base64)
    const dataObj = response.data[0];
    let finalImageUrl = "";

    if (dataObj.url) {
      // 如果返回的是网址
      finalImageUrl = dataObj.url;
    } else if (dataObj.b64_json) {
      // 如果返回的是 Base64
      finalImageUrl = `data:image/png;base64,${dataObj.b64_json}`;
    } else {
      throw new Error("No image URL or Base64 found in response");
    }

    // 4. 返回成功
    return new Response(JSON.stringify({ 
      image: finalImageUrl,
      status: 'success'
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    console.error("Image Error:", error);
    const msg = error.error?.message || error.message || "Unknown Error";
    return new Response(JSON.stringify({ error: `[Server] ${msg}` }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
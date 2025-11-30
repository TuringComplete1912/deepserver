import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.siliconflow.cn/v1" 
});

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { prompt } = await req.json();
    if (!prompt) throw new Error("Prompt is required");

    const response = await client.images.generate({
      model: "black-forest-labs/FLUX.1-schnell", 
      prompt: prompt, 
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });

    return new Response(JSON.stringify({ 
      image: `data:image/png;base64,${response.data[0].b64_json}`,
      status: 'success'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
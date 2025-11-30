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
    const { messages, model, useSearch } = await req.json();
    let finalMessages = [...messages];

    // 🔥 核心逻辑：联网搜索
    if (useSearch) {
      // 1. 获取用户最新的问题
      const userQuestion = messages[messages.length - 1].content;
      
      // 如果用户发的是复杂的对象(比如带图片的)，提取文字部分
      let query = userQuestion;
      if (Array.isArray(userQuestion)) {
        query = userQuestion.find(item => item.type === 'text')?.text || "Describe this image";
      }

      console.log(`[Searching] Query: ${query}`);

      // 2. 调用 Tavily 搜索 API
      const tavilyResponse = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY, // 从 Vercel 环境变量获取
          query: query,
          search_depth: "basic",
          include_answer: false,
          max_results: 5
        })
      });

      const searchData = await tavilyResponse.json();
      
      // 3. 将搜索结果整理成“上下文”
      if (searchData.results && searchData.results.length > 0) {
        const context = searchData.results.map(r => 
          `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`
        ).join("\n\n");

        // 4. 把搜索结果“塞”给 AI (作为 System Prompt 或补充信息)
        const searchContextMsg = {
          role: "system",
          content: `[Web Search Results]\nUse the following information to answer the user's question. If the answer is in the context, cite it.\n\n${context}`
        };
        
        // 插在最新消息之前
        finalMessages.splice(finalMessages.length - 1, 0, searchContextMsg);
      }
    }

    // --- 防止视觉模型报错逻辑 ---
    const hasImage = finalMessages.some(m => Array.isArray(m.content));
    const isVisionModel = model.includes('VL');
    if (hasImage && !isVisionModel) {
      throw new Error(`Model Mismatch: You sent an image but selected "${model}". Please switch to "Qwen2 VL".`);
    }

    // --- 发送给 AI ---
    const response = await client.chat.completions.create({
      model: model || "deepseek-ai/DeepSeek-V3",
      messages: finalMessages,
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
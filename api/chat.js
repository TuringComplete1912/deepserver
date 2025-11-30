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
    const { messages, model, useSearch } = await req.json();

    // 🛡️ 安全措施 1：输入长度暴力截断
    // 防止有人恶意粘贴整本小说来消耗你的 Token
    // 限制约为 6000 字符 (大约 2000-3000 tokens)
    const MAX_INPUT_CHARS = 6000;
    
    let finalMessages = messages.map(msg => {
      if (typeof msg.content === 'string' && msg.content.length > MAX_INPUT_CHARS) {
        return { ...msg, content: msg.content.substring(0, MAX_INPUT_CHARS) + "...(truncated)" };
      }
      return msg;
    });

    // 🛡️ 安全措施 2：强制系统安全提示词 (Legal & Safety)
    // 无论用户选什么模式，这层防护都在
    const safetySystemMsg = {
      role: "system",
      content: "IMPORTANT: You are a helpful AI assistant. You must REFUSE to generate content related to: illegal acts, violence, self-harm, pornography, or political hate speech. If asked, politely decline."
    };
    
    // 把安全提示词放在最前面
    finalMessages.unshift(safetySystemMsg);

    // ... (中间的联网搜索逻辑保持不变，为了篇幅省略，直接用你上一个版本的搜索逻辑即可) ...
    // ... 如果你不想重新复制粘贴搜索逻辑，可以直接把上面的安全措施加到你现有的代码里 ...
    // 为了稳妥，我这里还是把搜索逻辑完整放进去，确保你直接复制可用：

    if (useSearch) {
      const userQuestion = messages[messages.length - 1].content;
      let query = userQuestion;
      if (Array.isArray(userQuestion)) {
        query = userQuestion.find(item => item.type === 'text')?.text || "Describe this";
      }

      // 简单搜一下
      try {
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: query.substring(0, 400), // 搜索词也限制长度
            search_depth: "basic",
            max_results: 3 // 减少搜索结果数量以省钱
          })
        });
        const searchData = await tavilyResponse.json();
        if (searchData.results && searchData.results.length > 0) {
          const context = searchData.results.map(r => `Info: ${r.content}`).join("\n");
          finalMessages.splice(finalMessages.length - 1, 0, {
            role: "system",
            content: `[Search Context]: ${context}`
          });
        }
      } catch (e) {
        console.error("Search failed, skipping:", e);
      }
    }

    // 检查视觉模型
    const hasImage = finalMessages.some(m => Array.isArray(m.content));
    const isVisionModel = model.includes('VL');
    if (hasImage && !isVisionModel) {
      throw new Error(`Model Mismatch: Please switch to "Qwen2 VL".`);
    }

    // 3. 发送请求
    const response = await client.chat.completions.create({
      model: model || "deepseek-ai/DeepSeek-V3",
      messages: finalMessages,
      stream: true,
      // 🛡️ 安全措施 3：输出 Token 限制
      // 限制单次回复最多 2048 token，防止 AI 发疯无限输出
      max_tokens: 2048, 
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
    const msg = error.error?.message || error.message || "Server Error";
    return new Response(JSON.stringify({ error: `[Server] ${msg}` }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
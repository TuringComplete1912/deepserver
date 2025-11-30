import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.deepseek.com/v1" 
});

export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const { messages, model, type, length } = await req.json();

    let systemPrompt = "You are a helpful assistant.";
    if (type === 'ask') systemPrompt = "You are a professional translator and editor.";
    if (type === 'write') systemPrompt = `You are a professional writer. Target length: ${length || 'any'}.`;

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const response = await client.chat.completions.create({
      model: model || "deepseek-chat",
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
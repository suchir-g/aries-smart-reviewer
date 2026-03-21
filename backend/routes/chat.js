const express = require('express');
const OpenAI = require('openai');
const Article = require('../models/Article');
const { analyseSentiment } = require('../sentiment');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_news',
      description: 'Search for recent live news articles on a topic or query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_pulse',
      description:
        'Fetch news on a topic and score each article by sentiment. Returns articles sorted most positive → most negative.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic to analyse' },
        },
        required: ['topic'],
      },
    },
  },
];

async function executeTool(name, args) {
  if (name === 'search_news') {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(args.query)}&lang=en&max=5&apikey=${process.env.GNEWS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.articles || []).map(a => ({
      title: a.title,
      source: a.source?.name,
      description: a.description,
      url: a.url,
      publishedAt: a.publishedAt,
    }));
  }

  if (name === 'run_pulse') {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(args.topic)}&lang=en&max=8&apikey=${process.env.GNEWS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const results = await Promise.all(
      (data.articles || []).map(async a => {
        const score = await analyseSentiment(`${a.title} ${a.description || ''}`);
        return { title: a.title, source: a.source?.name, score: parseFloat(score.toFixed(3)), url: a.url };
      })
    );
    return results.sort((a, b) => b.score - a.score);
  }
}

// RAG: pull articles from DB relevant to the user's query
async function retrieveContext(query) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  if (words.length) {
    const orClauses = words.flatMap(w => [
      { title:   { $regex: w, $options: 'i' } },
      { summary: { $regex: w, $options: 'i' } },
      { topics:  { $elemMatch: { $regex: w, $options: 'i' } } },
    ]);
    const found = await Article.find({ $or: orClauses }).limit(6);
    if (found.length) return found;
  }

  // Fallback: 5 most recent
  return Article.find().sort({ analysedAt: -1 }).limit(5);
}

// POST /api/chat — SSE stream
router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // RAG: inject relevant saved articles as context
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const contextArticles = lastUser ? await retrieveContext(lastUser.content) : [];

    const contextBlock = contextArticles.length
      ? '\n\nRelevant articles from the user\'s analysis history:\n' +
        contextArticles.map(a =>
          `• "${a.title}" — ${a.source} | ${a.sentiment} (${a.sentimentScore?.toFixed(2)}) | Topics: ${a.topics?.join(', ')} | ${a.summary}`
        ).join('\n')
      : '';

    const systemPrompt =
      `You are a sharp, concise news intelligence assistant embedded in Smart Reviewer — a tool for analysing news sentiment.` +
      `\n\nYou can search for live news and run sentiment pulse analysis using your tools. ` +
      `When discussing sentiment scores, −1 is most negative and +1 is most positive. ` +
      `Be direct and insightful. Avoid filler phrases.` +
      contextBlock;

    let currentMessages = messages.map(m => ({ role: m.role, content: m.content }));

    // Agentic loop — keeps going until no more tool calls
    while (true) {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...currentMessages],
        tools: TOOLS,
        stream: true,
      });

      let fullContent = '';
      let toolCalls = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const finish = chunk.choices[0]?.finish_reason;
        if (!delta && !finish) continue;

        if (delta?.content) {
          fullContent += delta.content;
          send({ type: 'text', text: delta.content });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: '', name: '', arguments: '' };
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }

        if (finish === 'stop') {
          send({ type: 'done' });
          res.end();
          return;
        }

        if (finish === 'tool_calls') {
          // Add assistant turn with tool calls
          currentMessages.push({
            role: 'assistant',
            content: fullContent || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });

          // Execute each tool, streaming progress events
          for (const tc of toolCalls) {
            const args = JSON.parse(tc.arguments);
            send({ type: 'tool_start', tool: tc.name, input: args });
            const result = await executeTool(tc.name, args);
            send({ type: 'tool_end', tool: tc.name });
            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            });
          }

          toolCalls = [];
          fullContent = '';
          break; // restart loop with tool results
        }
      }
    }
  } catch (err) {
    send({ type: 'error', message: err.message });
    res.end();
  }
});

module.exports = router;

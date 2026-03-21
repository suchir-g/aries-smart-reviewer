const express = require('express');
const OpenAI = require('openai');
const { extract } = require('@extractus/article-extractor');
const Article = require('../models/Article');
const { analyseSentiment } = require('../sentiment');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchFullText(url) {
  try {
    const article = await extract(url, {}, { timeout: 8000 });
    const text = article?.content
      ? article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : null;
    return text && text.length > 100 ? text : null;
  } catch {
    return null;
  }
}

// POST /api/analyse
router.post('/', async (req, res) => {
  const { title, description, url, source, publishedAt, image } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    // Return cached result if already analysed
    const existing = await Article.findOne({ url });
    if (existing) {
      return res.json({ ...existing.toObject(), cached: true });
    }

    // Fetch full article text first (best-effort, falls back to snippet)
    const fullText = await fetchFullText(url);
    const sentimentInput = fullText || `${title} ${description}`;
    const usedFullText = !!fullText;

    // Build the article content block for OpenAI — use full text if available
    const articleBody = fullText
      ? `Article title: ${title}\n\nFull article text:\n${fullText.slice(0, 6000)}`
      : `Article title: ${title}\nArticle description: ${description}`;

    // Run TF sentiment and OpenAI summary/topics/bias in parallel
    const [sentimentScore, completion] = await Promise.all([
      analyseSentiment(sentimentInput),
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: `Analyse this news article and respond ONLY with a JSON object, no other text:
{
  "summary": "2-3 sentence summary of the article",
  "topics": ["topic1", "topic2", "topic3"],
  "biasSummary": "1-2 sentences on any framing bias, missing perspectives, or loaded language — or 'No notable bias detected' if balanced",
  "biasIndicators": ["specific phrase or pattern 1", "specific phrase or pattern 2"]
}

For biasIndicators: identify 2-4 concrete language choices or framing patterns from the text — e.g. emotionally loaded words, passive voice hiding agency, only quoting one side, use of 'regime' vs 'government', hedging claims differently for different groups. Keep each indicator short (under 12 words). If there are no notable indicators, return an empty array.

${articleBody}`,
          },
        ],
      }),
    ]);

    const raw = completion.choices[0].message.content.trim();
    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      analysis = JSON.parse(match ? match[1] : raw);
    }

    const score = Number(sentimentScore.toFixed(4));
    const sentiment =
      score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

    const sentimentReason = usedFullText
      ? `TensorFlow CNN (IMDB) — full article · confidence ${(Math.abs(score) * 100).toFixed(0)}% ${sentiment}`
      : `TensorFlow CNN (IMDB) — headline only · confidence ${(Math.abs(score) * 100).toFixed(0)}% ${sentiment}`;

    const article = await Article.create({
      title,
      description,
      url,
      source,
      publishedAt,
      image,
      summary: analysis.summary,
      sentiment,
      sentimentScore: score,
      sentimentReason,
      topics: analysis.topics || [],
      biasSummary: analysis.biasSummary || '',
      biasIndicators: analysis.biasIndicators || [],
    });

    res.json({ ...article.toObject(), cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const OpenAI = require('openai');
const Article = require('../models/Article');
const { analyseSentiment } = require('../sentiment');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // Run TF sentiment and OpenAI summary/topics in parallel
    const [sentimentScore, completion] = await Promise.all([
      analyseSentiment(`${title} ${description}`),
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

Article title: ${title}
Article description: ${description}`,
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
      sentimentReason: `TensorFlow CNN model (IMDB) — confidence ${(Math.abs(score) * 100).toFixed(0)}% ${sentiment}`,
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

const express = require('express');
const OpenAI = require('openai');
const { extract } = require('@extractus/article-extractor');
const Article = require('../models/Article');
const { analyseAll } = require('../sentiment');

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
    const existing = await Article.findOne({ url });
    if (existing) {
      return res.json({ ...existing.toObject(), cached: true });
    }

    // Fetch full article text first (best-effort, falls back to snippet)
    const fullText = await fetchFullText(url);
    const usedFullText = !!fullText;

    // Extract lead: first ~120 words of full text, or fallback to description
    const lead = fullText
      ? fullText.split(/\s+/).slice(0, 120).join(' ')
      : description || '';

    const articleBody = fullText
      ? `Article title: ${title}\n\nFull article text:\n${fullText.slice(0, 6000)}`
      : `Article title: ${title}\nArticle description: ${description}`;

    // Run all TF models and OpenAI in parallel
    const [{ consensus, models }, completion] = await Promise.all([
      analyseAll({ title, lead, fullText }),
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Analyze the following news article and respond ONLY with a valid JSON object. Do not include any extra text, explanations, or formatting.

Return the JSON in exactly this structure:

{
  "summary": "2-3 concise sentences summarizing the key facts of the article",
  "topics": ["primary topic", "secondary topic", "tertiary topic"],
  "biasSummary": "1-2 sentences describing framing bias, omissions, or loaded language — or exactly 'No notable bias detected' if the article is balanced",
  "biasIndicators": ["indicator 1", "indicator 2"]
}

Rules:
- Summary must be neutral and factual.
- Topics must be short noun phrases (exactly 3).
- Bias analysis should focus on framing, sourcing balance, word choice, or agency attribution.
- BiasIndicators:
  - Include 2–4 concrete language or framing examples if bias exists.
  - Each indicator must be 12 words or fewer.
  - Examples include emotionally loaded terms, passive voice hiding responsibility, one-sided sourcing, or labels like “regime” vs “government”.
  - Return an empty array [] if no clear bias is present.
- Output must be valid JSON (double quotes only, no trailing commas).
${articleBody}`,
        }],
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

    const score = consensus;
    const sentiment = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

    // Flag disagreement between models
    const scores = models.map(m => m.score);
    const stdDev = scores.length > 1
      ? Math.sqrt(scores.reduce((sum, s) => sum + (s - score) ** 2, 0) / scores.length)
      : 0;
    const contested = stdDev > 0.28;

    const sentimentReason = [
      usedFullText ? 'Full article' : 'Snippet only',
      `· ${models.length} passes · deduced ${score > 0 ? '+' : ''}${score.toFixed(2)}`,
      contested ? '· passes disagree' : '',
    ].join(' ').trim();

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
      reviewerScores: models,
    });

    res.json({ ...article.toObject(), cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

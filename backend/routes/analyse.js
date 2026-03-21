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
  "biasIndicators": ["specific phrase or pattern 1", "specific phrase or pattern 2"],
  "reviewers": [
    {
      "name": "Tone",
      "score": 0.0,
      "note": "one sentence on the emotional register and affect of the writing"
    },
    {
      "name": "Framing",
      "score": 0.0,
      "note": "one sentence on what is foregrounded, backgrounded, or omitted"
    },
    {
      "name": "Language",
      "score": 0.0,
      "note": "one sentence on word choices, loaded terms, or hedging patterns"
    }
  ]
}

For each reviewer, score is a number from -1.0 (very negative) to +1.0 (very positive) reflecting how positively or negatively the article presents its subject — not your opinion of the subject itself. Scores should reflect the article's own sentiment, not the nature of the topic.

For biasIndicators: identify 2-4 concrete language choices or framing patterns — e.g. emotionally loaded words, passive voice hiding agency, only quoting one side, use of 'regime' vs 'government'. Keep each under 12 words. Return an empty array if none.

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

    const tfScore = Number(sentimentScore.toFixed(4));

    // Build reviewer swarm from OpenAI response
    const reviewers = (analysis.reviewers || []).map(r => ({
      name: r.name,
      score: Math.max(-1, Math.min(1, Number(r.score) || 0)),
      note: r.note || '',
    }));

    // Consensus = mean of TF score + all reviewer scores
    const allScores = [tfScore, ...reviewers.map(r => r.score)];
    const consensus = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const score = Number(consensus.toFixed(4));

    // Disagreement: std deviation across all scores
    const mean = score;
    const stdDev = Math.sqrt(allScores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / allScores.length);
    const contested = stdDev > 0.28;

    const sentiment =
      score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

    const sentimentReason = [
      usedFullText ? 'Full article' : 'Headline only',
      `· ${allScores.length} reviewers · consensus ${score > 0 ? '+' : ''}${score.toFixed(2)}`,
      contested ? '· ⚠ contested' : '',
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
      reviewerScores: reviewers,
    });

    res.json({ ...article.toObject(), cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

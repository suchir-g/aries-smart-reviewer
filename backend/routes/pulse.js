const express = require('express');
const { analyseAll } = require('../sentiment');

const router = express.Router();

// GET /api/pulse?q=topic
// Fetches up to 10 articles, scores them with TF, returns sorted by sentiment.
// Does NOT save to DB — this is a quick read tool.
router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&apikey=${process.env.GNEWS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.errors?.[0] || 'GNews error' });
    }

    const articles = data.articles || [];
    if (articles.length === 0) {
      return res.json({ topic: q, articles: [] });
    }

    // Run sentiment sequentially to avoid spiking memory with 10 concurrent inferences
    const results = [];
    for (const a of articles) {
      const { consensus } = await analyseAll({
        title: a.title,
        lead: a.description || '',
        fullText: null,
      });
      results.push({
        title: a.title,
        description: a.description || '',
        source: a.source?.name || 'Unknown',
        url: a.url,
        publishedAt: a.publishedAt,
        image: a.image,
        score: parseFloat(consensus.toFixed(3)),
      });
    }

    results.sort((a, b) => b.score - a.score);

    res.json({ topic: q, articles: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

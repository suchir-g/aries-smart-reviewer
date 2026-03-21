const express = require('express');
const { analyseSentiment } = require('../sentiment');

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

    // Run TF sentiment on all articles in parallel
    const results = await Promise.all(
      articles.map(async (a) => {
        const score = await analyseSentiment(`${a.title} ${a.description || ''}`);
        return {
          title: a.title,
          source: a.source?.name || 'Unknown',
          url: a.url,
          score: parseFloat(score.toFixed(3)),
        };
      })
    );

    results.sort((a, b) => b.score - a.score);

    res.json({ topic: q, articles: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

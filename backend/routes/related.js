const express = require('express');
const router = express.Router();

// GET /api/related?q=topic&exclude=url
router.get('/', async (req, res) => {
  const { q, exclude } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=6&apikey=${process.env.GNEWS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.errors?.[0] || 'GNews error' });
    }

    const articles = (data.articles || [])
      .filter(a => a.url !== exclude)
      .slice(0, 5)
      .map(a => ({
        title: a.title,
        url: a.url,
        source: a.source?.name,
        publishedAt: a.publishedAt,
      }));

    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&apikey=${process.env.GNEWS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.errors?.[0] || 'GNews API error' });
    }

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source?.name,
      publishedAt: a.publishedAt,
      image: a.image,
    }));

    res.json(articles);
  } catch (err) {
    console.error('[news]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

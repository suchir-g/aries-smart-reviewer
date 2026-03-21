require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const newsRouter = require('./routes/news');
const analyseRouter = require('./routes/analyse');
const Article = require('./models/Article');
const { load: loadSentimentModel } = require('./sentiment');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/news', newsRouter);
app.use('/api/analyse', analyseRouter);

// GET /api/history — all analysed articles, newest first
app.get('/api/history', async (_req, res) => {
  try {
    const articles = await Article.find().sort({ analysedAt: -1 });
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Two topics match if they are equal, one contains the other, or they share a word ≥4 chars
function topicsMatch(a, b) {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = na.split(/\s+/).filter(w => w.length >= 4);
  const wordsB = new Set(nb.split(/\s+/).filter(w => w.length >= 4));
  return wordsA.some(w => wordsB.has(w));
}

// GET /api/graph — articles as graph nodes + edges via shared topics
app.get('/api/graph', async (req, res) => {
  try {
    const includeIsolated = req.query.includeIsolated === 'true';
    const articles = await Article.find().sort({ analysedAt: -1 });

    const nodes = articles.map(a => ({
      id: a._id.toString(),
      title: a.title,
      source: a.source,
      sentimentScore: a.sentimentScore,
      sentiment: a.sentiment,
      topics: a.topics,
    }));

    const links = [];
    for (let i = 0; i < articles.length; i++) {
      for (let j = i + 1; j < articles.length; j++) {
        const shared = (articles[i].topics || []).filter(t =>
          (articles[j].topics || []).some(t2 => topicsMatch(t, t2))
        );
        if (shared.length > 0) {
          links.push({
            source: articles[i]._id.toString(),
            target: articles[j]._id.toString(),
            sharedTopics: shared,
          });
        }
      }
    }

    if (includeIsolated) {
      return res.json({ nodes, links });
    }

    const connectedIds = new Set();
    links.forEach(e => {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    });

    res.json({
      nodes: nodes.filter(n => connectedIds.has(n.id)),
      links,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    loadSentimentModel().catch(err => console.warn('[sentiment] Preload failed:', err.message));
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

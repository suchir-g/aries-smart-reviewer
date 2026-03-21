require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const newsRouter = require('./routes/news');
const analyseRouter = require('./routes/analyse');
const pulseRouter = require('./routes/pulse');
const chatRouter = require('./routes/chat');
const relatedRouter = require('./routes/related');
const Article = require('./models/Article');
const { load: loadSentimentModel } = require('./sentiment');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/news', newsRouter);
app.use('/api/analyse', analyseRouter);
app.use('/api/pulse', pulseRouter);
app.use('/api/chat', chatRouter);
app.use('/api/related', relatedRouter);

// GET /api/history — all analysed articles, newest first
app.get('/api/history', async (_req, res) => {
  try {
    const articles = await Article.find().sort({ analysedAt: -1 });
    res.json(articles);
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

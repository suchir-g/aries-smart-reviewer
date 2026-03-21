const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  url: { type: String, required: true, unique: true },
  source: String,
  publishedAt: String,
  image: String,
  summary: String,
  sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
  sentimentScore: Number,
  sentimentReason: String,
  topics: [String],
  biasSummary: String,
  biasIndicators: [String],
  reviewerScores: [{ name: String, score: Number, note: String }],
  analysedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Article', articleSchema);

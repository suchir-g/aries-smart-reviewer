/**
 * train.js — Train a news-specific sentiment model from MongoDB data.
 *
 * Usage:
 *   node train.js [--epochs 20] [--min-articles 50]
 *
 * Requires MONGODB_URI in .env (or environment).
 * Saves model + vocab to ./news-sentiment-model/
 */

require('dotenv').config();
const tf = require('@tensorflow/tfjs-node');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Article = require('./models/Article');

const MODEL_DIR = path.join(__dirname, 'news-sentiment-model');
const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.json');
const STATS_PATH = path.join(MODEL_DIR, 'stats.json');

const MAX_VOCAB  = 12000;
const MAX_LEN    = 200;
const EMBED_DIM  = 32;
const MIN_ARTICLES = parseInt(process.argv.find(a => a.startsWith('--min-articles='))?.split('=')[1] ?? '30');
const EPOCHS     = parseInt(process.argv.find(a => a.startsWith('--epochs='))?.split('=')[1] ?? '20');

// ── Tokenisation ──────────────────────────────────────────────────────────────

function tokenise(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildVocab(texts) {
  const freq = {};
  for (const text of texts) {
    for (const word of tokenise(text)) {
      freq[word] = (freq[word] || 0) + 1;
    }
  }
  // Sort by frequency, take top MAX_VOCAB
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VOCAB - 3)
    .map(([word]) => word);

  // 0 = pad, 1 = start, 2 = OOV
  const vocab = { '<PAD>': 0, '<START>': 1, '<OOV>': 2 };
  sorted.forEach((w, i) => { vocab[w] = i + 3; });
  return vocab;
}

function encode(text, vocab) {
  const words = tokenise(text);
  const seq = words.map(w => vocab[w] ?? 2); // 2 = OOV
  // Pad / truncate to MAX_LEN
  if (seq.length >= MAX_LEN) return seq.slice(0, MAX_LEN);
  return [...new Array(MAX_LEN - seq.length).fill(0), ...seq];
}

// ── Model architecture ────────────────────────────────────────────────────────

function buildModel(vocabSize) {
  const model = tf.sequential();

  model.add(tf.layers.embedding({
    inputDim: vocabSize,
    outputDim: EMBED_DIM,
    inputLength: MAX_LEN,
    maskZero: false,
  }));

  model.add(tf.layers.conv1d({
    filters: 64,
    kernelSize: 5,
    activation: 'relu',
    padding: 'valid',
  }));

  model.add(tf.layers.globalMaxPooling1d());

  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.4 }));
  model.add(tf.layers.dense({ units: 1, activation: 'tanh' })); // output in [-1, 1]

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGODB_URI);

  const articles = await Article.find({
    sentimentScore: { $exists: true },
    $or: [
      { title: { $exists: true, $ne: '' } },
      { description: { $exists: true, $ne: '' } },
    ],
  }).lean();

  console.log(`Found ${articles.length} labelled articles.`);

  if (articles.length < MIN_ARTICLES) {
    console.error(
      `Need at least ${MIN_ARTICLES} articles to train (have ${articles.length}).\n` +
      `Analyse more articles then re-run. Use --min-articles=N to override.`
    );
    process.exit(1);
  }

  // Build text corpus: title + description (full text not stored in DB)
  const texts  = articles.map(a => `${a.title} ${a.description || ''}`);
  const labels = articles.map(a => a.sentimentScore); // already in [-1, 1]

  console.log(`Score range: min=${Math.min(...labels).toFixed(3)}, max=${Math.max(...labels).toFixed(3)}, mean=${(labels.reduce((a,b)=>a+b,0)/labels.length).toFixed(3)}`);

  // Build vocab
  console.log('Building vocabulary…');
  const vocab = buildVocab(texts);
  console.log(`Vocabulary size: ${Object.keys(vocab).length}`);

  // Encode
  const sequences = texts.map(t => encode(t, vocab));

  // Shuffle
  const indices = tf.util.createShuffledIndices(sequences.length);
  const shuffledSeqs   = Array.from(indices).map(i => sequences[i]);
  const shuffledLabels = Array.from(indices).map(i => labels[i]);

  // Train / val split (80/20)
  const splitAt = Math.floor(shuffledSeqs.length * 0.8);
  const trainX = shuffledSeqs.slice(0, splitAt);
  const trainY = shuffledLabels.slice(0, splitAt);
  const valX   = shuffledSeqs.slice(splitAt);
  const valY   = shuffledLabels.slice(splitAt);

  const xTrain = tf.tensor2d(trainX, [trainX.length, MAX_LEN], 'int32');
  const yTrain = tf.tensor1d(trainY);
  const xVal   = tf.tensor2d(valX,   [valX.length,  MAX_LEN], 'int32');
  const yVal   = tf.tensor1d(valY);

  console.log(`Training on ${trainX.length} articles, validating on ${valX.length}…\n`);

  const model = buildModel(Object.keys(vocab).length);
  model.summary();

  // Early stopping: stop if val loss hasn't improved in 5 epochs
  let bestValLoss = Infinity;
  let patience = 0;
  const PATIENCE = 5;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const history = await model.fit(xTrain, yTrain, {
      epochs: 1,
      batchSize: 16,
      validationData: [xVal, yVal],
      verbose: 0,
    });
    const trainLoss = history.history.loss[0].toFixed(4);
    const valLoss   = history.history.val_loss[0].toFixed(4);
    const mae       = history.history.val_mae[0].toFixed(4);
    console.log(`Epoch ${epoch + 1}/${EPOCHS}  loss=${trainLoss}  val_loss=${valLoss}  val_mae=${mae}`);

    if (history.history.val_loss[0] < bestValLoss) {
      bestValLoss = history.history.val_loss[0];
      patience = 0;
    } else {
      patience++;
      if (patience >= PATIENCE) {
        console.log(`\nEarly stopping at epoch ${epoch + 1} (no improvement for ${PATIENCE} epochs).`);
        break;
      }
    }
  }

  // Save
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });
  await model.save(`file://${MODEL_DIR}`);
  fs.writeFileSync(VOCAB_PATH, JSON.stringify({ vocab, maxLen: MAX_LEN }));
  fs.writeFileSync(STATS_PATH, JSON.stringify({
    trainedAt: new Date().toISOString(),
    articleCount: articles.length,
    vocabSize: Object.keys(vocab).length,
    bestValLoss,
  }, null, 2));

  console.log(`\nModel saved to ${MODEL_DIR}`);
  console.log(`Best val loss: ${bestValLoss.toFixed(4)}`);

  xTrain.dispose(); yTrain.dispose(); xVal.dispose(); yVal.dispose();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

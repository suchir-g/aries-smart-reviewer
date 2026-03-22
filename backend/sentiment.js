require('@tensorflow/tfjs-node');
const tf       = require('@tensorflow/tfjs-node');
const toxicity = require('@tensorflow-models/toxicity');
const fs   = require('fs');
const path = require('path');

const LOCAL_MODEL_DIR  = path.join(__dirname, 'news-sentiment-model');
const LOCAL_MODEL_PATH = path.join(LOCAL_MODEL_DIR, 'model.json');
const LOCAL_VOCAB_PATH = path.join(LOCAL_MODEL_DIR, 'vocab.json');
const LOCAL_STATS_PATH = path.join(LOCAL_MODEL_DIR, 'stats.json');

let sentimentPipeline = null;
let localModel        = null;
let localVocab        = null;
let localMaxLen       = null;
let localStats        = null;
let toxicityModel     = null;

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  if (sentimentPipeline) return;

  // Twitter RoBERTa — trained on 124M tweets, far better than IMDB for news text
  const { pipeline } = await import('@xenova/transformers');
  sentimentPipeline = await pipeline(
    'sentiment-analysis',
    'Xenova/twitter-roberta-base-sentiment-latest',
  );
  console.log('[sentiment] Twitter RoBERTa model loaded');

  // Toxicity model — only load locally (too heavy for Render)
  if (process.env.LOCAL_MODELS === 'true') {
    try {
      toxicityModel = await toxicity.load(0.5, []);
      console.log('[sentiment] Toxicity model loaded');
    } catch (err) {
      console.warn('[sentiment] Toxicity model unavailable:', err.message);
      toxicityModel = null;
    }
  }

  // Local news model if trained — only load locally
  if (process.env.LOCAL_MODELS === 'true' && fs.existsSync(LOCAL_MODEL_PATH) && fs.existsSync(LOCAL_VOCAB_PATH)) {
    try {
      localModel = await tf.loadLayersModel(`file://${LOCAL_MODEL_PATH}`);
      const vocabData = JSON.parse(fs.readFileSync(LOCAL_VOCAB_PATH, 'utf8'));
      localVocab  = vocabData.vocab;
      localMaxLen = vocabData.maxLen;
      localStats  = fs.existsSync(LOCAL_STATS_PATH)
        ? JSON.parse(fs.readFileSync(LOCAL_STATS_PATH, 'utf8'))
        : {};
      console.log('[sentiment] Local news model loaded');
    } catch (err) {
      console.warn('[sentiment] Failed to load local model:', err.message);
      localModel = null;
    }
  }
}

// ── Inference ─────────────────────────────────────────────────────────────────

// Returns a score in [-1, 1] using Twitter RoBERTa (positive - negative probability)
async function scoreText(text) {
  const input   = text.slice(0, 512); // RoBERTa token limit
  const results = await sentimentPipeline(input, { topk: 3 });
  const map     = {};
  results.forEach(r => { map[r.label.toLowerCase()] = r.score; });
  return (map.positive ?? 0) - (map.negative ?? 0); // [-1, 1]
}

// Returns overall toxicity probability [0, 1], or null if model unavailable
async function scoreToxicity(text) {
  if (!toxicityModel) return null;
  try {
    const snippet     = text.slice(0, 500);
    const predictions = await toxicityModel.classify([snippet]);
    const overall     = predictions.find(p => p.label === 'toxicity');
    return overall ? overall.results[0].probabilities[1] : null;
  } catch {
    return null;
  }
}

function tokenizeLocal(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const seq = words.map(w => localVocab[w] ?? 2);
  if (seq.length >= localMaxLen) return seq.slice(0, localMaxLen);
  return [...new Array(localMaxLen - seq.length).fill(0), ...seq];
}

async function scoreLocal(text) {
  const tokens = tokenizeLocal(text);
  const input  = tf.tensor2d([tokens], [1, localMaxLen], 'int32');
  const pred   = localModel.predict(input);
  const [score] = await pred.data();
  input.dispose(); pred.dispose();
  return score;
}

/**
 * Returns { consensus, models: [{ name, score, note }] }
 * Runs across lead paragraph and full body independently,
 * plus the local news model and toxicity classifier if available.
 */
async function analyseAll({ title, lead, fullText }) {
  await load();

  const models = [];

  // 1. Lead paragraph
  if (lead && lead.trim()) {
    const leadScore = await scoreText(lead);
    models.push({
      name: 'Lead',
      score: Number(leadScore.toFixed(4)),
      note: 'Sentiment of the opening paragraph',
    });
  }

  // 2. Full body
  const bodyText  = fullText || `${title} ${lead || ''}`;
  const bodyScore = await scoreText(bodyText);
  models.push({
    name: 'Full Text',
    score: Number(bodyScore.toFixed(4)),
    note: 'Sentiment across the entire article',
  });

  // 3. Local news model on full body
  if (localModel) {
    const local = await scoreLocal(bodyText);
    models.push({
      name: 'News Model',
      score: Number(local.toFixed(4)),
      note: 'Specially trained model',
    });
  }

  // 4. Toxicity — maps toxic probability to [-1, 0] range
  const toxicityProb = await scoreToxicity(bodyText);
  if (toxicityProb !== null) {
    models.push({
      name: 'Toxicity',
      score: Number(-(toxicityProb).toFixed(4)),
      note: `Toxic content probability: ${(toxicityProb * 100).toFixed(0)}%`,
    });
  }

  // Weighted base: Full Text carries more signal than Lead
  const WEIGHTS = { 'Full Text': 0.65, 'Lead': 0.35 };
  const coreModels  = models.filter(m => m.name !== 'News Model' && m.name !== 'Toxicity');
  const totalWeight = coreModels.reduce((sum, m) => sum + (WEIGHTS[m.name] ?? 0.5), 0);
  const weightedBase = coreModels.reduce((sum, m) =>
    sum + m.score * (WEIGHTS[m.name] ?? 0.5), 0) / totalWeight;

  // Certainty: std dev across core passes — high disagreement dampens toward 0
  const mean   = coreModels.reduce((s, m) => s + m.score, 0) / coreModels.length;
  const stdDev = Math.sqrt(
    coreModels.reduce((s, m) => s + (m.score - mean) ** 2, 0) / coreModels.length
  );
  const certainty = Math.max(0.45, 1 - stdDev * 1.2);
  const dampened  = weightedBase * certainty;

  // News model nudge: if available, blend in 15%
  const newsModel = models.find(m => m.name === 'News Model');
  let consensus   = newsModel
    ? dampened * 0.85 + newsModel.score * 0.15
    : dampened;

  // Toxicity override: high toxicity hard-anchors into negative territory
  if (toxicityProb !== null && toxicityProb > 0.7) {
    const toxicityCap = -(0.3 + (toxicityProb - 0.7) * (0.7 / 0.3));
    consensus = Math.min(consensus, toxicityCap);
  }

  return { consensus: Number(consensus.toFixed(4)), models };
}

// Kept for compatibility with pulse route
async function analyseSentiment(text) {
  await load();
  return scoreText(text);
}

function modelInfo() {
  return {
    loaded: !!sentimentPipeline,
    local:  !!localModel,
    localStats: localStats ?? null,
  };
}

module.exports = { analyseSentiment, analyseAll, load, modelInfo };

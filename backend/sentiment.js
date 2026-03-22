require('@tensorflow/tfjs-node');
const tf       = require('@tensorflow/tfjs-node');
const toxicity = require('@tensorflow-models/toxicity');
const fs   = require('fs');
const path = require('path');

const IMDB_MODEL_URL    = 'https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/model.json';
const IMDB_METADATA_URL = 'https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/metadata.json';

const LOCAL_MODEL_DIR  = path.join(__dirname, 'news-sentiment-model');
const LOCAL_MODEL_PATH = path.join(LOCAL_MODEL_DIR, 'model.json');
const LOCAL_VOCAB_PATH = path.join(LOCAL_MODEL_DIR, 'vocab.json');
const LOCAL_STATS_PATH = path.join(LOCAL_MODEL_DIR, 'stats.json');

let imdbModel      = null;
let imdbMetadata   = null;
let localModel     = null;
let localVocab     = null;
let localMaxLen    = null;
let localStats     = null;
let toxicityModel  = null;

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  if (imdbModel) return; // already loaded

  // Always load IMDB
  const [loadedModel, res] = await Promise.all([
    tf.loadLayersModel(IMDB_MODEL_URL),
    fetch(IMDB_METADATA_URL),
  ]);
  imdbModel    = loadedModel;
  imdbMetadata = await res.json();
  console.log('[sentiment] IMDB model loaded');

  // Load toxicity model (best-effort — may not be fully compatible with TF 4.x)
  try {
    toxicityModel = await toxicity.load(0.5, []);
    console.log('[sentiment] Toxicity model loaded');
  } catch (err) {
    console.warn('[sentiment] Toxicity model unavailable:', err.message);
    toxicityModel = null;
  }

  // Load local news model if it exists
  if (fs.existsSync(LOCAL_MODEL_PATH) && fs.existsSync(LOCAL_VOCAB_PATH)) {
    try {
      localModel = await tf.loadLayersModel(`file://${LOCAL_MODEL_PATH}`);
      const vocabData = JSON.parse(fs.readFileSync(LOCAL_VOCAB_PATH, 'utf8'));
      localVocab  = vocabData.vocab;
      localMaxLen = vocabData.maxLen;
      localStats  = fs.existsSync(LOCAL_STATS_PATH)
        ? JSON.parse(fs.readFileSync(LOCAL_STATS_PATH, 'utf8'))
        : {};
      console.log(`[sentiment] Local news model loaded`);
    } catch (err) {
      console.warn('[sentiment] Failed to load local model:', err.message);
      localModel = null;
    }
  }
}

// ── Tokenisation ──────────────────────────────────────────────────────────────

function tokenizeIMDB(text) {
  const { word_index, index_from, max_len, vocabulary_size } = imdbMetadata;
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const indices = words
    .map(w => {
      if (word_index[w] === undefined) return 2;
      const idx = word_index[w] + index_from;
      return idx < vocabulary_size ? idx : 2;
    })
    .slice(0, max_len);
  const padded = new Array(max_len).fill(0);
  const offset = max_len - indices.length;
  indices.forEach((v, i) => { padded[offset + i] = v; });
  return padded;
}

function tokenizeLocal(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const seq = words.map(w => localVocab[w] ?? 2);
  if (seq.length >= localMaxLen) return seq.slice(0, localMaxLen);
  return [...new Array(localMaxLen - seq.length).fill(0), ...seq];
}

// ── Inference ─────────────────────────────────────────────────────────────────

async function scoreIMDB(text) {
  const tokens = tokenizeIMDB(text);
  const input  = tf.tensor2d([tokens], [1, imdbMetadata.max_len], 'int32');
  const pred   = imdbModel.predict(input);
  const [prob] = await pred.data();
  input.dispose(); pred.dispose();
  // IMDB is a binary classifier — raw output clusters near 0 or 1.
  // Apply tanh compression to avoid ±1.00 extremes in news scoring.
  const raw = prob * 2 - 1;             // linear map: [0,1] → [-1,1]
  return Math.tanh(raw * 1.2) * 0.72;  // squash extremes, cap at ~±0.72
}

// Returns overall toxicity probability [0, 1], or null if model unavailable
async function scoreToxicity(text) {
  if (!toxicityModel) return null;
  try {
    const snippet = text.slice(0, 500); // keep it fast
    const predictions = await toxicityModel.classify([snippet]);
    const overall = predictions.find(p => p.label === 'toxicity');
    return overall ? overall.results[0].probabilities[1] : null;
  } catch {
    return null;
  }
}

async function scoreLocal(text) {
  const tokens = tokenizeLocal(text);
  const input  = tf.tensor2d([tokens], [1, localMaxLen], 'int32');
  const pred   = localModel.predict(input);
  const [score] = await pred.data(); // tanh, already [-1,1]
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
    const leadScore = await scoreIMDB(lead);
    models.push({
      name: 'Lead',
      score: Number(leadScore.toFixed(4)),
      note: 'Sentiment of the opening paragraph',
    });
  }

  // 2. Full body
  const bodyText = fullText || `${title} ${lead || ''}`;
  const bodyScore = await scoreIMDB(bodyText);
  models.push({
    name: 'Full Text',
    score: Number(bodyScore.toFixed(4)),
    note: 'Sentiment across the entire article',
  });

  // 4. Local news model on full body
  if (localModel) {
    const local = await scoreLocal(bodyText);
    models.push({
      name: 'News Model',
      score: Number(local.toFixed(4)),
      note: 'Specially trained model',
    });
  }

  // 5. Toxicity — runs in parallel, maps toxic probability to [-1, 0] range
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
  const coreModels = models.filter(m => m.name !== 'News Model');
  const totalWeight = coreModels.reduce((sum, m) => sum + (WEIGHTS[m.name] ?? 0.2), 0);
  const weightedBase = coreModels.reduce((sum, m) =>
    sum + m.score * (WEIGHTS[m.name] ?? 0.2), 0) / totalWeight;

  // Certainty: std dev across core passes — high disagreement dampens toward 0
  const mean = coreModels.reduce((s, m) => s + m.score, 0) / coreModels.length;
  const stdDev = Math.sqrt(
    coreModels.reduce((s, m) => s + (m.score - mean) ** 2, 0) / coreModels.length
  );
  // certainty in [0.45, 1.0] — even max disagreement keeps some signal
  const certainty = Math.max(0.45, 1 - stdDev * 1.2);
  const dampened = weightedBase * certainty;

  // News model nudge: if available, blend in 15% of its score
  const newsModel = models.find(m => m.name === 'News Model');
  let consensus = newsModel
    ? dampened * 0.85 + newsModel.score * 0.15
    : dampened;

  // Toxicity override: if content is highly toxic, hard-anchor into negative territory
  if (toxicityProb !== null && toxicityProb > 0.7) {
    // Clamp consensus to at most -0.3, scaling with toxicity strength
    const toxicityCap = -(0.3 + (toxicityProb - 0.7) * (0.7 / 0.3));
    consensus = Math.min(consensus, toxicityCap);
  }

  return { consensus: Number(consensus.toFixed(4)), models };
}

// Kept for compatibility with pulse route which only needs a single score
async function analyseSentiment(text) {
  await load();
  return scoreIMDB(text);
}

function modelInfo() {
  return {
    loaded: !!imdbModel,
    imdb: !!imdbModel,
    local: !!localModel,
    localStats: localStats ?? null,
  };
}

module.exports = { analyseSentiment, analyseAll, load, modelInfo };

require('@tensorflow/tfjs-node');
const tf = require('@tensorflow/tfjs-node');

const MODEL_URL =
  'https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/model.json';
const METADATA_URL =
  'https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/metadata.json';

let model = null;
let metadata = null;

async function load() {
  if (model && metadata) return;
  const [loadedModel, res] = await Promise.all([
    tf.loadLayersModel(MODEL_URL),
    fetch(METADATA_URL),
  ]);
  model = loadedModel;
  metadata = await res.json();
  console.log('[sentiment] TF model loaded');
}

function tokenize(text) {
  const { word_index, index_from, max_len } = metadata;
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const { vocabulary_size } = metadata;
  const indices = words
    .map(w => {
      if (word_index[w] === undefined) return 2; // OOV
      const idx = word_index[w] + index_from;
      return idx < vocabulary_size ? idx : 2;    // clamp out-of-range to OOV
    })
    .slice(0, max_len);

  // Pad with zeros at the start (pre-padding, same as Keras default)
  const padded = new Array(max_len).fill(0);
  const offset = max_len - indices.length;
  indices.forEach((v, i) => { padded[offset + i] = v; });
  return padded;
}

/**
 * Returns a sentiment score in [-1, 1].
 * 0–1 raw probability from the model is mapped: score = prob * 2 - 1
 */
async function analyseSentiment(text) {
  await load();
  const tokens = tokenize(text);
  const input = tf.tensor2d([tokens], [1, metadata.max_len], 'int32');
  const prediction = model.predict(input);
  const [prob] = await prediction.data();
  input.dispose();
  prediction.dispose();
  return prob * 2 - 1; // map [0,1] → [-1,1]
}

module.exports = { analyseSentiment, load };

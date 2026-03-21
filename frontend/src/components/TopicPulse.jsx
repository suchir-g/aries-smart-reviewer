import { useState } from 'react'
import { scoreToColour } from '../utils/sentiment'

const PRESET_TOPICS = [
  'Technology', 'Economy', 'Climate', 'Politics',
  'Health', 'Science', 'Conflict', 'Business',
]

function SentimentBar({ score }) {
  const colour = scoreToColour(score)
  const pct = Math.abs(score) * 50  // 0–50% of half the track

  return (
    <div className="pulse-bar-track">
      <div className="pulse-bar-half pulse-bar-left">
        {score < 0 && (
          <div
            className="pulse-bar-fill"
            style={{ width: `${pct}%`, background: colour }}
          />
        )}
      </div>
      <div className="pulse-bar-midline" />
      <div className="pulse-bar-half pulse-bar-right">
        {score >= 0 && (
          <div
            className="pulse-bar-fill"
            style={{ width: `${pct}%`, background: colour }}
          />
        )}
      </div>
    </div>
  )
}

export default function TopicPulse({ onFetch }) {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function run(q) {
    const query = q ?? topic.trim()
    if (!query) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await onFetch(query)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handlePreset(t) {
    setTopic(t)
    run(t)
  }

  return (
    <div className="pulse-wrap">
      <div className="pulse-controls">
        <div className="pulse-presets">
          {PRESET_TOPICS.map(t => (
            <button
              key={t}
              className={`graph-chip${topic === t ? ' graph-chip-active' : ''}`}
              onClick={() => handlePreset(t)}
              disabled={loading}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="pulse-search">
          <input
            className="pulse-input"
            type="text"
            placeholder="Custom topic…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
          />
          <button
            className="pulse-run-btn"
            onClick={() => run()}
            disabled={loading || !topic.trim()}
          >
            {loading ? 'Analysing…' : 'Run'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="pulse-loading">
          Fetching &amp; scoring articles…
        </div>
      )}

      {result && !loading && (
        <div className="pulse-results">
          <div className="pulse-results-header">
            <span className="pulse-topic-label">"{result.topic}"</span>
            <span className="pulse-axis-labels">
              <span>← More negative</span>
              <span>More positive →</span>
            </span>
          </div>

          {result.articles.length === 0 ? (
            <p className="pulse-empty">No articles found for this topic.</p>
          ) : (
            <div className="pulse-chart">
              {result.articles.map((a, i) => (
                <div key={i} className="pulse-row">
                  <div className="pulse-row-meta">
                    <span className="pulse-source">{a.source}</span>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pulse-title"
                      title={a.title}
                    >
                      {a.title.length > 72 ? a.title.slice(0, 70) + '…' : a.title}
                    </a>
                  </div>
                  <div className="pulse-row-chart">
                    <SentimentBar score={a.score} />
                    <span
                      className="pulse-score"
                      style={{ color: scoreToColour(a.score) }}
                    >
                      {a.score > 0 ? '+' : ''}{a.score.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

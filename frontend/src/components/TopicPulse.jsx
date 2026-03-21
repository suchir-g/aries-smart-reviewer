import { useState } from 'react'
import { scoreToColour } from '../utils/sentiment'

const PRESET_TOPICS = [
  'Technology', 'Economy', 'Climate', 'Politics',
  'Health', 'Science', 'Conflict', 'Business',
]

const TOPIC_GROUPS = [
  {
    label: 'World & Politics',
    topics: ['US Politics', 'Ukraine', 'Middle East', 'China', 'NATO', 'Elections', 'Diplomacy', 'Sanctions'],
  },
  {
    label: 'Economy',
    topics: ['Inflation', 'Stock Markets', 'Housing Crisis', 'Federal Reserve', 'Trade War', 'Recession', 'Oil Prices'],
  },
  {
    label: 'Science & Tech',
    topics: ['Artificial Intelligence', 'Cybersecurity', 'Space Exploration', 'Electric Vehicles', 'Biotech', 'Nuclear Energy'],
  },
  {
    label: 'Society',
    topics: ['Climate Change', 'Immigration', 'Healthcare', 'Education', 'Crime', 'Mental Health', 'Inequality'],
  },
]

// ── Scatter strip ────────────────────────────────────────────────────────────
function SentimentScatter({ articles }) {
  const [hovered, setHovered] = useState(null)

  const W = 700, H = 130
  const PAD = { left: 40, right: 40, top: 16, bottom: 30 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const midY  = PAD.top + plotH / 2

  const xOf  = s  => PAD.left + ((s + 1) / 2) * plotW
  const yOf  = i  => midY + (((i % 4) - 1.5) / 1.5) * (plotH * 0.28)

  const ticks = [-1, -0.5, 0, 0.5, 1]

  return (
    <div className="scatter-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="sg" x1="0" x2="1">
            <stop offset="0%"   stopColor="rgb(239,68,68)"   stopOpacity="0.07" />
            <stop offset="50%"  stopColor="rgb(156,163,175)" stopOpacity="0.03" />
            <stop offset="100%" stopColor="rgb(34,197,94)"   stopOpacity="0.07" />
          </linearGradient>
        </defs>

        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="url(#sg)" />

        {ticks.map(t => (
          <g key={t}>
            <line
              x1={xOf(t)} y1={PAD.top + plotH}
              x2={xOf(t)} y2={PAD.top + plotH + 5}
              stroke="var(--border-strong)" strokeWidth={1}
            />
            <text
              x={xOf(t)} y={H - 4}
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              fontSize={9} fill="var(--text)" opacity={0.7}
            >
              {t > 0 ? `+${t}` : t}
            </text>
          </g>
        ))}

        <line
          x1={PAD.left} y1={PAD.top + plotH}
          x2={W - PAD.right} y2={PAD.top + plotH}
          stroke="var(--border)" strokeWidth={1}
        />
        <line
          x1={xOf(0)} y1={PAD.top}
          x2={xOf(0)} y2={PAD.top + plotH}
          stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3"
        />

        {articles.map((a, i) => {
          const cx = xOf(a.score)
          const cy = yOf(i)
          const isHov = hovered === i
          return (
            <circle
              key={i}
              cx={cx} cy={cy}
              r={isHov ? 8 : 6}
              fill={scoreToColour(a.score)}
              stroke="var(--bg)" strokeWidth={2}
              style={{ cursor: a.url ? 'pointer' : 'default', transition: 'r 0.1s' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => a.url && window.open(a.url, '_blank')}
            />
          )
        })}

        {hovered !== null && (() => {
          const a  = articles[hovered]
          const cx = xOf(a.score)
          const cy = yOf(hovered)
          const lx = Math.min(Math.max(cx, PAD.left + 40), W - PAD.right - 40)
          const ly = cy < midY ? cy + 22 : cy - 14
          return (
            <text
              x={lx} y={ly}
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              fontSize={10} fontWeight={600} fill="var(--text-h)"
            >
              {a.source}
            </text>
          )
        })()}
      </svg>

      <div className="scatter-tooltip">
        {hovered !== null
          ? articles[hovered].title
          : <span style={{ opacity: 0.4 }}>Hover a dot to see the headline</span>
        }
      </div>
    </div>
  )
}

// ── Diverging bar ────────────────────────────────────────────────────────────
function SentimentBar({ score }) {
  const colour = scoreToColour(score)
  const pct = Math.abs(score) * 50
  return (
    <div className="pulse-bar-track">
      <div className="pulse-bar-half pulse-bar-left">
        {score < 0 && <div className="pulse-bar-fill" style={{ width: `${pct}%`, background: colour }} />}
      </div>
      <div className="pulse-bar-midline" />
      <div className="pulse-bar-half pulse-bar-right">
        {score >= 0 && <div className="pulse-bar-fill" style={{ width: `${pct}%`, background: colour }} />}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function PulseEmptyState({ onSelect }) {
  return (
    <div className="pulse-empty-state">
      <p className="pulse-empty-hint">Choose a topic to see how it's being covered right now.</p>
      <div className="pulse-topic-groups">
        {TOPIC_GROUPS.map(group => (
          <div key={group.label} className="pulse-group">
            <h3 className="pulse-group-label">{group.label}</h3>
            <div className="pulse-group-topics">
              {group.topics.map(t => (
                <button key={t} className="pulse-topic-btn" onClick={() => onSelect(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function TopicPulse({ onFetch, onAnalyse, analysing }) {
  const [topic,   setTopic]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  async function run(q) {
    const query = q ?? topic.trim()
    if (!query) return
    setTopic(query)
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

  const isEmpty = !result && !loading && !error

  return (
    <div className="pulse-wrap">
      <div className="pulse-header">
        <div className="pulse-header-left">
          <h2 className="pulse-title">Topic Pulse</h2>
          <p className="pulse-subtitle">Enter a topic to see how it's being covered right now — each dot is an article, scored and ranked by sentiment.</p>
        </div>
        <div className="pulse-search">
          <input
            className="pulse-input"
            type="text"
            placeholder="Enter a topic…"
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

      <div className="pulse-presets">
        {PRESET_TOPICS.map(t => (
          <button
            key={t}
            className={`graph-chip${topic === t ? ' graph-chip-active' : ''}`}
            onClick={() => run(t)}
            disabled={loading}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && <div className="pulse-loading">Fetching &amp; scoring articles…</div>}

      {isEmpty && <PulseEmptyState onSelect={run} />}

      {result && !loading && (
        <div className="pulse-results">
          <div className="pulse-results-header">
            <span className="pulse-topic-label">"{result.topic}"</span>
            <span className="pulse-axis-labels">
              <span>← Negative</span>
              <span>Positive →</span>
            </span>
          </div>

          {result.articles.length === 0 ? (
            <p className="pulse-empty">No articles found for this topic.</p>
          ) : (
            <>
              <SentimentScatter articles={result.articles} />
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
                      <span className="pulse-score" style={{ color: scoreToColour(a.score) }}>
                        {a.score > 0 ? '+' : ''}{a.score.toFixed(2)}
                      </span>
                      {onAnalyse && (
                        <button
                          className="pulse-analyse-btn"
                          onClick={() => onAnalyse(a)}
                          disabled={analysing}
                          title="Full analysis"
                        >
                          Analyse
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

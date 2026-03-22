import { useState } from 'react'
import { scoreToColour } from '../utils/sentiment'
import { apiFetch } from '../utils/api'

const SEED_TOPICS = [
  'Gaza conflict', 'US elections', 'climate change', 'artificial intelligence',
  'Ukraine war', 'inflation', 'immigration', 'healthcare', 'stock market', 'China Taiwan',
]

function ScorePip({ score }) {
  const colour = scoreToColour(score)
  return (
    <span className="dc-score-pip" style={{ color: colour }}>
      {score > 0 ? '+' : ''}{score.toFixed(2)}
    </span>
  )
}

function ArticleRow({ article, onScoreChange }) {
  const { title, source, url, sentimentScore, status } = article

  return (
    <div className={`dc-row dc-row-${status}`}>
      <div className="dc-row-meta">
        <span className="dc-row-source">{source}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="dc-row-title">
          {title}
        </a>
      </div>
      <div className="dc-row-right">
        {status === 'pending' && <span className="dc-status">Waiting…</span>}
        {status === 'analysing' && <span className="dc-status dc-status-active">Analysing…</span>}
        {status === 'done' && (
          <>
            <ScorePip score={sentimentScore} />
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={sentimentScore}
              onChange={e => onScoreChange(Number(e.target.value))}
              className="dc-slider"
              style={{ accentColor: scoreToColour(sentimentScore) }}
            />
          </>
        )}
        {status === 'error' && <span className="dc-status dc-status-error">Failed</span>}
        {status === 'cached' && (
          <>
            <ScorePip score={sentimentScore} />
            <span className="dc-status dc-status-cached">Cached</span>
          </>
        )}
      </div>
    </div>
  )
}

export default function DataCollect() {
  const [topic, setTopic] = useState('')
  const [articles, setArticles] = useState([])
  const [fetching, setFetching] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [doneCount, setDoneCount] = useState(0)

  async function fetchArticles() {
    if (!topic.trim()) return
    setFetching(true)
    setError(null)
    setArticles([])
    setDoneCount(0)
    try {
      const data = await apiFetch(`/api/news?q=${encodeURIComponent(topic.trim())}`)
      setArticles(data.map(a => ({ ...a, status: 'pending', sentimentScore: 0 })))
    } catch (err) {
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }

  async function analyseAll() {
    setRunning(true)
    setDoneCount(0)
    let done = 0

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]
      if (article.status === 'done' || article.status === 'cached') {
        done++
        setDoneCount(done)
        continue
      }

      setArticles(prev => prev.map((a, idx) =>
        idx === i ? { ...a, status: 'analysing' } : a
      ))

      try {
        const data = await apiFetch('/api/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(article),
        })
        setArticles(prev => prev.map((a, idx) =>
          idx === i ? {
            ...a,
            status: data.cached ? 'cached' : 'done',
            sentimentScore: data.sentimentScore,
          } : a
        ))
      } catch {
        setArticles(prev => prev.map((a, idx) =>
          idx === i ? { ...a, status: 'error' } : a
        ))
      }

      done++
      setDoneCount(done)
    }

    setRunning(false)
  }

  function updateScore(idx, score) {
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, sentimentScore: score } : a))
  }

  const doneArticles = articles.filter(a => a.status === 'done' || a.status === 'cached').length
  const totalArticles = articles.length

  return (
    <div className="dc-wrap">
      <div className="dc-header">
        <h2 className="dc-title">Collect Training Data</h2>
        <p className="dc-desc">
          Fetch articles on a topic and analyse them in bulk. Adjust any score with the slider before training.
        </p>
      </div>

      <div className="dc-controls">
        <div className="dc-search">
          <input
            className="dc-input"
            type="text"
            placeholder="Enter a topic…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchArticles()}
            disabled={fetching || running}
          />
          <button
            className="dc-fetch-btn"
            onClick={fetchArticles}
            disabled={fetching || running || !topic.trim()}
          >
            {fetching ? 'Fetching…' : 'Fetch articles'}
          </button>
        </div>

        <div className="dc-seeds">
          {SEED_TOPICS.map(t => (
            <button
              key={t}
              className="dc-seed-btn"
              onClick={() => { setTopic(t); }}
              disabled={fetching || running}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {articles.length > 0 && (
        <>
          <div className="dc-toolbar">
            <span className="dc-progress">
              {doneArticles}/{totalArticles} analysed
            </span>
            <button
              className="dc-analyse-btn"
              onClick={analyseAll}
              disabled={running || doneArticles === totalArticles}
            >
              {running ? `Analysing… (${doneCount}/${totalArticles})` : 'Analyse all'}
            </button>
          </div>

          <div className="dc-list">
            {articles.map((article, i) => (
              <ArticleRow
                key={article.url}
                article={article}
                onScoreChange={score => updateScore(i, score)}
              />
            ))}
          </div>

          {doneArticles > 0 && !running && (
            <p className="dc-train-hint">
              {doneArticles} article{doneArticles !== 1 ? 's' : ''} saved to MongoDB.
              Run <code>npm run train</code> in the backend to retrain the model.
            </p>
          )}
        </>
      )}
    </div>
  )
}

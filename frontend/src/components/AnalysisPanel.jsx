import { useState, useEffect } from 'react'
import { scoreToColour } from '../utils/sentiment'

const API = 'http://localhost:3001'

const SENTIMENT_STYLES = {
  positive: { label: 'Positive', className: 'badge badge-positive' },
  neutral:  { label: 'Neutral',  className: 'badge badge-neutral'  },
  negative: { label: 'Negative', className: 'badge badge-negative' },
}

function ScoreBar({ score }) {
  if (score == null) return null
  const pct = ((score + 1) / 2) * 100
  const colour = scoreToColour(score)
  return (
    <div className="score-bar-wrap" title={`Sentiment score: ${score.toFixed(2)}`}>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: colour }} />
        <div className="score-bar-midline" />
      </div>
      <span className="score-bar-label" style={{ color: colour }}>
        {score > 0 ? '+' : ''}{score.toFixed(2)}
      </span>
    </div>
  )
}

function RelatedArticles({ topics, currentUrl }) {
  const [articles, setArticles] = useState(null)

  useEffect(() => {
    if (!topics?.length) return
    const q = topics.slice(0, 2).join(' ')
    fetch(`${API}/api/related?q=${encodeURIComponent(q)}&exclude=${encodeURIComponent(currentUrl)}`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setArticles(data) : setArticles([]))
      .catch(() => setArticles([]))
  }, [topics, currentUrl])

  if (articles === null) {
    return (
      <div className="panel-related">
        <h3 className="panel-section-label">Other Perspectives</h3>
        <div className="related-loading">
          {[1,2,3].map(i => <div key={i} className="skeleton skeleton-related" />)}
        </div>
      </div>
    )
  }

  if (articles.length === 0) return null

  return (
    <div className="panel-related">
      <h3 className="panel-section-label">Other Perspectives</h3>
      <ul className="related-list">
        {articles.map(a => (
          <li key={a.url} className="related-item">
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="related-link">
              {a.title}
            </a>
            <span className="related-source">{a.source}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReviewerSwarm({ reviewers, tfScore }) {
  if (!reviewers?.length) return null
  const allReviewers = [
    { name: 'TF Model', score: tfScore, note: 'TensorFlow CNN trained on IMDB corpus' },
    ...reviewers,
  ]
  return (
    <div className="panel-swarm">
      <h3 className="panel-section-label">Reviewer Swarm</h3>
      <div className="swarm-list">
        {allReviewers.map((r) => (
          <div key={r.name} className="swarm-row">
            <span className="swarm-name">{r.name}</span>
            <div className="swarm-bar-wrap">
              <div className="swarm-bar-track">
                <div className="swarm-bar-midline" />
                <div
                  className="swarm-bar-fill"
                  style={{
                    left: r.score >= 0 ? '50%' : `${((r.score + 1) / 2) * 100}%`,
                    width: `${Math.abs(r.score) * 50}%`,
                    background: scoreToColour(r.score),
                  }}
                />
              </div>
              <span className="swarm-score" style={{ color: scoreToColour(r.score) }}>
                {r.score > 0 ? '+' : ''}{r.score.toFixed(2)}
              </span>
            </div>
            <span className="swarm-note">{r.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnalysisPanel({ article }) {
  if (!article) return null

  const { title, source, url, summary, sentiment, sentimentScore, sentimentReason, topics, biasSummary, biasIndicators, reviewerScores, cached } = article
  const style = SENTIMENT_STYLES[sentiment] ?? SENTIMENT_STYLES.neutral
  const hasBias = biasSummary || biasIndicators?.length > 0

  // Back-calculate approximate TF score: consensus = mean(tf, r1, r2, r3)
  // consensus * 4 - sum(reviewers) = tf
  const tfScore = reviewerScores?.length
    ? Number((sentimentScore * (reviewerScores.length + 1) - reviewerScores.reduce((s, r) => s + r.score, 0)).toFixed(2))
    : sentimentScore

  return (
    <div className="analysis-panel">
      <div className="panel-header">
        <h2>
          <a href={url} target="_blank" rel="noopener noreferrer" className="panel-title-link">
            {title}
          </a>
        </h2>
        <span className="panel-source">{source?.name ?? source}</span>
        {cached && <span className="badge badge-cached">Cached</span>}
      </div>
      <div className="panel-body">
        <p className="panel-summary">{summary}</p>

        <div className="panel-sentiment">
          <span className={style.className}>{style.label}</span>
          <ScoreBar score={sentimentScore} />
          <span className="sentiment-reason">{sentimentReason}</span>
        </div>

        {topics?.length > 0 && (
          <div className="panel-topics">
            {topics.map((t) => (
              <span key={t} className="topic-chip">{t}</span>
            ))}
          </div>
        )}

        <ReviewerSwarm reviewers={reviewerScores} tfScore={tfScore} />

        {hasBias && (
          <div className="panel-bias">
            <h3 className="panel-section-label">Bias & Framing</h3>
            {biasSummary && (
              <p className="bias-summary">{biasSummary}</p>
            )}
            {biasIndicators?.length > 0 && (
              <ul className="bias-indicators">
                {biasIndicators.map((indicator, i) => (
                  <li key={i} className="bias-indicator">{indicator}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <RelatedArticles topics={topics} currentUrl={url} />
      </div>
    </div>
  )
}

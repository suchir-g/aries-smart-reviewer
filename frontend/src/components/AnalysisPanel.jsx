import { scoreToColour } from '../utils/sentiment'

const SENTIMENT_STYLES = {
  positive: { label: 'Positive', className: 'badge badge-positive' },
  neutral:  { label: 'Neutral',  className: 'badge badge-neutral'  },
  negative: { label: 'Negative', className: 'badge badge-negative' },
}

function ScoreBar({ score }) {
  if (score == null) return null
  const pct = ((score + 1) / 2) * 100  // map -1..1 → 0..100%
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

export default function AnalysisPanel({ article }) {
  if (!article) return null

  const { title, source, summary, sentiment, sentimentScore, sentimentReason, topics, cached } = article
  const style = SENTIMENT_STYLES[sentiment] ?? SENTIMENT_STYLES.neutral

  return (
    <div className="analysis-panel">
      <div className="panel-header">
        <h2>{title}</h2>
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
      </div>
    </div>
  )
}

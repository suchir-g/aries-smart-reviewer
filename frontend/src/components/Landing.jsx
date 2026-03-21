import { useState } from 'react'
import { scoreToColour } from '../utils/sentiment'

const TICKER_A = [
  'Search & Analyse', 'Track Sentiment', 'Detect Bias',
  'Compare Sources', 'Understand the News', 'Topic Pulse',
  'AI-Powered Summaries', 'Other Perspectives', 'Follow the Story',
]

const TICKER_B = [
  'TensorFlow Scoring', 'Real-Time Coverage', 'Positive · Neutral · Negative',
  'News Intelligence', 'Surface the Signal', 'Cross-Source Analysis',
  'Know What the News Feels', 'Framing & Language', 'See the Full Picture',
]

function Ticker({ items, reverse = false }) {
  const all = [...items, ...items, ...items]
  return (
    <div className="ticker-track">
      <div className={`ticker-inner${reverse ? ' ticker-reverse' : ''}`}>
        {all.map((item, i) => (
          <span key={i} className="ticker-item">
            {item}
            <span className="ticker-sep">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const FEATURES = [
  {
    title: 'Search & Analyse',
    body: 'Find articles on any subject and get AI-generated summaries, TensorFlow sentiment scoring, and bias indicators — instantly.',
    action: 'search',
    cta: 'Search articles →',
  },
  {
    title: 'Topic Pulse',
    body: 'Pick a topic and see how positively or negatively it\'s being covered across sources right now, ranked by sentiment.',
    action: 'pulse',
    cta: 'Run a pulse →',
  },
  {
    title: 'Ask the News',
    body: 'Have a conversation about the news. Search live headlines, run sentiment analysis, or ask about articles you\'ve already reviewed.',
    action: 'chat',
    cta: 'Start asking →',
  },
]

export default function Landing({ history, onSearch, setPage }) {
  const [query, setQuery] = useState('')

  function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    onSearch(query.trim())
  }

  const recent = history.slice(0, 5)

  return (
    <div className="landing">

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-blob landing-blob-1" />
        <div className="landing-blob landing-blob-2" />
        <div className="landing-blob landing-blob-3" />
        <div className="landing-blob landing-blob-4" />
        <div className="landing-blob landing-blob-5" />
        <div className="landing-hero-inner">
          <p className="landing-kicker">News intelligence</p>
          <h1 className="landing-title"><em>Smart</em> Reviewer</h1>
          <p className="landing-tagline">
            Search the news. Understand the sentiment. Detect the framing.
          </p>
          <form className="landing-search" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search for a topic or story…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="landing-search-input"
              autoFocus
            />
            <button type="submit" className="landing-search-btn">Search</button>
          </form>
        </div>
      </section>

      {/* Ticker strips */}
      <div className="ticker-wrap">
        <Ticker items={TICKER_A} />
        <Ticker items={TICKER_B} reverse />
      </div>

      {/* Feature columns */}
      <section className="landing-features">
        {FEATURES.map(f => (
          <div key={f.action} className="landing-feature">
            <h3 className="landing-feature-title">{f.title}</h3>
            <p className="landing-feature-body">{f.body}</p>
            <button className="landing-feature-cta" onClick={() => setPage(f.action)}>
              {f.cta}
            </button>
          </div>
        ))}
      </section>

      {/* Recent analyses */}
      {recent.length > 0 && (
        <section className="landing-recent">
          <h2 className="section-title">Recently Analysed</h2>
          <div className="landing-recent-list">
            {recent.map(item => (
              <div key={item._id ?? item.url} className="landing-recent-row">
                <div className="landing-recent-left">
                  <span className="landing-recent-source">{item.source?.name ?? item.source}</span>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="landing-recent-title">
                      {item.title}
                    </a>
                  ) : (
                    <span className="landing-recent-title">{item.title}</span>
                  )}
                </div>
                <span
                  className="landing-recent-score"
                  style={{ color: scoreToColour(item.sentimentScore ?? 0) }}
                >
                  {(item.sentimentScore ?? 0) > 0 ? '+' : ''}
                  {(item.sentimentScore ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <button className="landing-view-all" onClick={() => setPage('history')}>
            View all →
          </button>
        </section>
      )}

      {/* How it works */}
      <section className="landing-how">
        <div className="landing-how-inner">
          <h2 className="landing-how-title">How the scoring works</h2>
          <div className="landing-how-steps">
            <div className="landing-how-step">
              <span className="landing-how-num">01</span>
              <h3 className="landing-how-step-title">Three independent passes</h3>
              <p className="landing-how-step-body">
                Each article is scored separately across its headline, lead paragraph, and full body by a TensorFlow CNN. Each pass returns a score in [−1, +1]. Divergence between them is itself informative — a sensational headline with a neutral body is a framing signal.
              </p>
              <div className="landing-formula">
                <span className="lf-row"><span className="lf-label">Headline</span><span className="lf-val">× 0.20</span></span>
                <span className="lf-row"><span className="lf-label">Lead</span><span className="lf-val">× 0.30</span></span>
                <span className="lf-row"><span className="lf-label">Full Text</span><span className="lf-val">× 0.50</span></span>
              </div>
            </div>
            <div className="landing-how-step">
              <span className="landing-how-num">02</span>
              <h3 className="landing-how-step-title">Certainty dampening</h3>
              <p className="landing-how-step-body">
                The weighted base is scaled by a certainty factor derived from the standard deviation across passes. High disagreement pulls the score toward neutral — uncertainty is part of the answer.
              </p>
              <div className="landing-formula">
                <span className="lf-row"><span className="lf-label">σ</span><span className="lf-val">std dev of passes</span></span>
                <span className="lf-row"><span className="lf-label">certainty</span><span className="lf-val">max(0.45, 1 − σ × 1.2)</span></span>
                <span className="lf-row lf-row-result"><span className="lf-label">score</span><span className="lf-val">weighted × certainty</span></span>
              </div>
            </div>
            <div className="landing-how-step">
              <span className="landing-how-num">03</span>
              <h3 className="landing-how-step-title">News model nudge</h3>
              <p className="landing-how-step-body">
                Every article analysed is saved as training data. Once enough data exists, a specially trained news model is built. When active, it contributes 15% to the final score — nudging it toward news-specific language patterns.
              </p>
              <div className="landing-formula">
                <span className="lf-row"><span className="lf-label">base</span><span className="lf-val">× 0.85</span></span>
                <span className="lf-row"><span className="lf-label">news model</span><span className="lf-val">× 0.15</span></span>
                <span className="lf-row lf-row-result"><span className="lf-label">final</span><span className="lf-val">sum of above</span></span>
              </div>
            </div>
            <div className="landing-how-step">
              <span className="landing-how-num">04</span>
              <h3 className="landing-how-step-title">Toxicity override</h3>
              <p className="landing-how-step-body">
                A TensorFlow toxicity classifier runs on every article. If toxic content is detected above 70% confidence, the final score is hard-anchored into negative territory regardless of the sentiment passes — preventing harmful framing from reading as positive.
              </p>
              <div className="landing-formula">
                <span className="lf-row"><span className="lf-label">threshold</span><span className="lf-val">p &gt; 0.70</span></span>
                <span className="lf-row"><span className="lf-label">cap</span><span className="lf-val">−0.30 − (p − 0.70) × 2.33</span></span>
                <span className="lf-row lf-row-result"><span className="lf-label">result</span><span className="lf-val">min(score, cap)</span></span>
              </div>
            </div>
          </div>

          <div className="landing-collect-cta">
            <p className="landing-collect-text">
              Want to accelerate training? Bulk-collect and rate articles across topics.
            </p>
            <button className="landing-collect-btn" onClick={() => setPage('collect')}>
              Open data collector →
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

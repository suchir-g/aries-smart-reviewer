import { useState } from 'react'
import { scoreToColour } from '../utils/sentiment'

const TICKER_A = [
  'Search & Analyse', 'Track Sentiment', 'Discover Connections',
  'Compare Sources', 'Understand the News', 'Topic Pulse',
  'AI-Powered Summaries', 'Sentiment Graphs', 'Follow the Story',
]

const TICKER_B = [
  'TensorFlow Scoring', 'Real-Time Coverage', 'Positive · Neutral · Negative',
  'News Intelligence', 'Surface the Signal', 'Cross-Source Analysis',
  'Know What the News Feels', 'Graph the Headlines', 'See the Full Picture',
]

function Ticker({ items, reverse = false }) {
  // Duplicate so the loop is seamless
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
    body: 'Find articles on any subject and get AI-generated summaries with TensorFlow sentiment scoring — instantly.',
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
    title: 'Sentiment Graph',
    body: 'Articles you\'ve analysed are mapped as nodes. Shared topics draw connections — revealing the shape of the news.',
    action: 'graph',
    cta: 'Open graph →',
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
        <div className="landing-hero-inner">
          <p className="landing-kicker">News intelligence</p>
          <h1 className="landing-title"><em>Smart</em> Reviewer</h1>
          <p className="landing-tagline">
            Search the news. Understand the sentiment. See the connections.
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
    </div>
  )
}

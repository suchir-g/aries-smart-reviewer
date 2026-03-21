import { useState, useEffect } from 'react'
import SearchBar from './components/SearchBar'
import ArticleCard from './components/ArticleCard'
import AnalysisPanel from './components/AnalysisPanel'
import HistoryTable from './components/HistoryTable'
import GraphView from './components/GraphView'
import TopicPulse from './components/TopicPulse'
import './App.css'

const API = 'http://localhost:3001'

async function apiFetch(path, options) {
  const res = await fetch(`${API}${path}`, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export default function App() {
  const [query, setQuery] = useState('')
  const [articles, setArticles] = useState([])
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [history, setHistory] = useState([])
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [activeTab, setActiveTab] = useState('graph')
  const [searching, setSearching] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    refreshHistoryAndGraph()
  }, [])

  useEffect(() => {
    if (!selectedArticle) return
    const onKey = (e) => { if (e.key === 'Escape') setSelectedArticle(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedArticle])

  async function refreshHistoryAndGraph() {
    try {
      const [hist, graph] = await Promise.all([
        apiFetch('/api/history'),
        apiFetch('/api/graph?includeIsolated=true'),
      ])
      setHistory(hist)
      setGraphData(graph)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const results = await apiFetch(`/api/news?q=${encodeURIComponent(query.trim())}`)
      setArticles(results)
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  async function handleAnalyse(article) {
    setAnalysing(true)
    setError(null)
    try {
      const result = await apiFetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article),
      })
      setSelectedArticle(result)
      await refreshHistoryAndGraph()
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalysing(false)
    }
  }

  function handleSelect(item) {
    setSelectedArticle(item)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1><em>Smart</em> Reviewer</h1>
        <p className="subtitle">AI-powered summaries &amp; sentiment analysis</p>
        <p className="masthead-date">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </header>

      <main className="app-main">
        <SearchBar query={query} onChange={setQuery} onSearch={handleSearch} loading={searching} />

        {error && <div className="error-banner">{error}</div>}

        {articles.length > 0 && (
          <section className="results-section">
            <h2 className="section-title">Results</h2>
            <div className="articles-grid">
              {articles.map((article) => (
                <ArticleCard
                  key={article.url}
                  article={article}
                  onAnalyse={handleAnalyse}
                  loading={analysing}
                />
              ))}
            </div>
          </section>
        )}

        {selectedArticle && (
          <div className="modal-backdrop" onClick={() => setSelectedArticle(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedArticle(null)} aria-label="Close">✕</button>
              <AnalysisPanel article={selectedArticle} />
            </div>
          </div>
        )}

        <section className="history-section">
          <div className="tab-bar">
            <button
              className={`tab-btn${activeTab === 'graph' ? ' tab-active' : ''}`}
              onClick={() => setActiveTab('graph')}
            >
              Graph
            </button>
            <button
              className={`tab-btn${activeTab === 'table' ? ' tab-active' : ''}`}
              onClick={() => setActiveTab('table')}
            >
              Table
            </button>
            <button
              className={`tab-btn${activeTab === 'pulse' ? ' tab-active' : ''}`}
              onClick={() => setActiveTab('pulse')}
            >
              Pulse
            </button>
          </div>

          {activeTab === 'graph' && (
            <GraphView graphData={graphData} onSelectArticle={handleSelect} />
          )}
          {activeTab === 'table' && (
            <HistoryTable history={history} onSelect={handleSelect} />
          )}
          {activeTab === 'pulse' && (
            <TopicPulse onFetch={(q) => apiFetch(`/api/pulse?q=${encodeURIComponent(q)}`)} />
          )}
        </section>
      </main>
    </div>
  )
}

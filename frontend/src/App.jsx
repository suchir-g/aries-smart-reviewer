import { useState, useEffect } from 'react'
import Nav from './components/Nav'
import Landing from './components/Landing'
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
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`Server error ${res.status} — is the backend running?`)
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export default function App() {
  const [page, setPage] = useState('landing')

  // Shared data
  const [history, setHistory] = useState([])
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })

  // Search page state
  const [query, setQuery] = useState('')
  const [articles, setArticles] = useState([])
  const [searching, setSearching] = useState(false)
  const [analysing, setAnalysing] = useState(false)

  // Modal
  const [selectedArticle, setSelectedArticle] = useState(null)

  const [error, setError] = useState(null)

  useEffect(() => { refreshHistoryAndGraph() }, [])

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

  async function handleSearch(q) {
    const searchQuery = q ?? query
    if (!searchQuery.trim()) return
    if (q) setQuery(q)
    setPage('search')
    setSearching(true)
    setError(null)
    try {
      const results = await apiFetch(`/api/news?q=${encodeURIComponent(searchQuery.trim())}`)
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

  return (
    <div className="app">
      <Nav page={page} setPage={setPage} />

      {page === 'landing' && (
        <Landing history={history} onSearch={handleSearch} setPage={setPage} />
      )}

      {page !== 'landing' && (
        <main className="app-main">
          {error && <div className="error-banner">{error}</div>}

          {page === 'search' && (
            <div className="page">
              <SearchBar
                query={query}
                onChange={setQuery}
                onSearch={() => handleSearch()}
                loading={searching}
              />
              {articles.length > 0 && (
                <section>
                  <h2 className="section-title">Results</h2>
                  <div className="articles-grid">
                    {articles.map(article => (
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
            </div>
          )}

          {page === 'pulse' && (
            <div className="page">
              <h2 className="section-title">Topic Pulse</h2>
              <TopicPulse onFetch={(q) => apiFetch(`/api/pulse?q=${encodeURIComponent(q)}`)} />
            </div>
          )}

          {page === 'graph' && (
            <div className="page">
              <h2 className="section-title">Sentiment Graph</h2>
              <GraphView graphData={graphData} onSelectArticle={setSelectedArticle} />
            </div>
          )}

          {page === 'history' && (
            <div className="page">
              <h2 className="section-title">Analysis History</h2>
              <HistoryTable history={history} onSelect={setSelectedArticle} />
            </div>
          )}
        </main>
      )}

      {selectedArticle && (
        <div className="modal-backdrop" onClick={() => setSelectedArticle(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedArticle(null)}>✕</button>
            <AnalysisPanel article={selectedArticle} />
          </div>
        </div>
      )}
    </div>
  )
}

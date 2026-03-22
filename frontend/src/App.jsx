import { useState, useEffect } from 'react'
import Nav from './components/Nav'
import Landing from './components/Landing'
import SearchBar from './components/SearchBar'
import ArticleCard from './components/ArticleCard'
import AnalysisPanel from './components/AnalysisPanel'
import HistoryTable from './components/HistoryTable'
import TopicPulse from './components/TopicPulse'
import ChatPage from './components/ChatPage'
import DataCollect from './components/DataCollect'
import CustomCursor from './components/CustomCursor'
import './App.css'

// const API = 'https://aries-smart-reviewer.onrender.com'
const API = "http://localhost:3001"

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
  const [chatOpen, setChatOpen] = useState(false)

  const [history, setHistory] = useState([])

  const [query, setQuery] = useState('')
  const [articles, setArticles] = useState([])
  const [searching, setSearching] = useState(false)
  const [analysing, setAnalysing] = useState(false)

  const [selectedArticle, setSelectedArticle] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { refreshHistory() }, [])

  useEffect(() => {
    if (!selectedArticle) return
    const onKey = (e) => { if (e.key === 'Escape') setSelectedArticle(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedArticle])

  async function refreshHistory() {
    try {
      const hist = await apiFetch('/api/history')
      setHistory(hist)
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
      await refreshHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalysing(false)
    }
  }

  return (
    <div className="app">
      <CustomCursor />
      <Nav page={page} setPage={setPage} chatOpen={chatOpen} setChatOpen={setChatOpen} />

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
              <TopicPulse
                onFetch={(q) => apiFetch(`/api/pulse?q=${encodeURIComponent(q)}`)}
                onAnalyse={handleAnalyse}
                analysing={analysing}
              />
            </div>
          )}

          {page === 'history' && (
            <div className="page">
              <h2 className="section-title">Analysis History</h2>
              <HistoryTable history={history} onSelect={setSelectedArticle} />
            </div>
          )}

          {page === 'collect' && (
            <div className="page">
              <DataCollect />
            </div>
          )}

        </main>
      )}

      <div className={`chat-sidebar${chatOpen ? ' chat-sidebar-open' : ''}`}>
        <div className="chat-sidebar-header">
          <span className="chat-sidebar-title">Ask the News</span>
          <button className="chat-sidebar-close" onClick={() => setChatOpen(false)}>✕</button>
        </div>
        <ChatPage />
      </div>
      {chatOpen && <div className="chat-sidebar-backdrop" onClick={() => setChatOpen(false)} />}

      {(analysing || selectedArticle) && (
        <div className="modal-backdrop" onClick={() => !analysing && setSelectedArticle(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            {!analysing && (
              <button className="modal-close" onClick={() => setSelectedArticle(null)}>✕</button>
            )}
            {analysing ? (
              <div className="analysis-panel skeleton-panel">
                <div className="panel-header">
                  <div className="skeleton skeleton-title" />
                  <div className="skeleton skeleton-source" />
                </div>
                <div className="panel-body">
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line" style={{ width: '88%' }} />
                  <div className="skeleton skeleton-line" style={{ width: '72%' }} />
                  <div className="skeleton skeleton-bar" />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <div className="skeleton skeleton-chip" />
                    <div className="skeleton skeleton-chip" style={{ width: 64 }} />
                    <div className="skeleton skeleton-chip" style={{ width: 80 }} />
                  </div>
                </div>
              </div>
            ) : (
              <AnalysisPanel article={selectedArticle} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

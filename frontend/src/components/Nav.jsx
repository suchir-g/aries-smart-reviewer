const LINKS = [
  { id: 'search',  label: 'Search'  },
  { id: 'pulse',   label: 'Pulse'   },
  { id: 'history', label: 'History' },
]

export default function Nav({ page, setPage, chatOpen, setChatOpen }) {
  return (
    <nav className="app-nav">
      <button className="nav-brand" onClick={() => setPage('landing')}>
        <em>Smart</em> Reviewer
      </button>
      <div className="nav-links">
        {LINKS.map(({ id, label }) => (
          <button
            key={id}
            className={`nav-link${page === id ? ' nav-link-active' : ''}`}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
        <button
          className={`nav-ask-btn${chatOpen ? ' nav-ask-btn-active' : ''}`}
          onClick={() => setChatOpen(o => !o)}
        >
          Ask
        </button>
      </div>
    </nav>
  )
}

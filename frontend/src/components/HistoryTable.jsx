const SENTIMENT_STYLES = {
  positive: 'badge badge-positive',
  neutral:  'badge badge-neutral',
  negative: 'badge badge-negative',
}

export default function HistoryTable({ history, onSelect }) {
  if (!history.length) {
    return (
      <div className="history-empty">No analyses yet. Search for articles and hit Analyse!</div>
    )
  }

  return (
    <table className="history-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Source</th>
          <th>Sentiment</th>
          <th>Analysed</th>
        </tr>
      </thead>
      <tbody>
        {history.map((item) => (
          <tr key={item._id ?? item.url} onClick={() => onSelect(item)} className="history-row">
            <td className="history-title">
              {item.title}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="history-link"
                  onClick={e => e.stopPropagation()}
                >
                  ↗
                </a>
              )}
            </td>
            <td>{item.source?.name ?? item.source}</td>
            <td>
              <span className={SENTIMENT_STYLES[item.sentiment] ?? SENTIMENT_STYLES.neutral}>
                {item.sentiment}
              </span>
            </td>
            <td>{new Date(item.analysedAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

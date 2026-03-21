export default function ArticleCard({ article, onAnalyse, loading }) {
  const { title, description, source, publishedAt, image, url } = article

  return (
    <div className="article-card">
      {image && <img src={image} alt="" className="article-img" />}
      <div className="article-body">
        <div className="article-meta">
          <span className="source">{source?.name ?? source}</span>
          <span className="date">{new Date(publishedAt).toLocaleDateString()}</span>
        </div>
        <h3 className="article-title">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="article-title-link">
              {title}
            </a>
          ) : title}
        </h3>
        <p className="article-desc">{description}</p>
        <button
          className="analyse-btn"
          onClick={() => onAnalyse(article)}
          disabled={loading}
        >
          {loading ? 'Analysing...' : 'Analyse'}
        </button>
      </div>
    </div>
  )
}

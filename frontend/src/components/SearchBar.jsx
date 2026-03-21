export default function SearchBar({ query, onChange, onSearch }) {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search for news articles..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
      />
      <button onClick={onSearch}>Search</button>
    </div>
  )
}

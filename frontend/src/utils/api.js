export const API_BASE =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.VITE_LOCAL_MODELS
    ? 'http://localhost:3001'
    : 'https://aries-smart-reviewer.onrender.com')

export function apiUrl(path) {
  return `${API_BASE}${path}`
}

export async function apiFetch(path, options) {
  const res = await fetch(apiUrl(path), options)
  const contentType = res.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    throw new Error(`Server error ${res.status} - is the backend running?`)
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

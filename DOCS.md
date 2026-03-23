# Aries Smart Reviewer - Internal Documentation

## Architecture overview

```text
Frontend (React/Vite)
  -> env-based API helper
  -> Backend (Express)
     -> MongoDB
     -> GNews
     -> OpenAI
     -> Local sentiment stack
```

The frontend uses `frontend/src/utils/api.js` to decide which backend to call. This avoids the previous split where some screens pointed to localhost and others pointed to Render.

## Visual flows

### Main app loop

```mermaid
flowchart TD
  A[App loads] --> B[Frontend requests history]
  B --> C[GET /api/history]
  C --> D[MongoDB returns analysed articles]
  D --> E[Landing and history UI render]

  E --> F[Search action]
  F --> G[GET /api/news]
  G --> H[GNews search results]
  H --> I[Search results grid]

  I --> J[Analyse action]
  J --> K[POST /api/analyse]
  K --> L[Cache check]
  L --> M[Full-text extraction]
  M --> N[Sentiment plus OpenAI analysis]
  N --> O[Save article to MongoDB]
  O --> P[Analysis modal]
```

### Analyse route

```mermaid
flowchart TD
  A[POST /api/analyse] --> B{URL provided?}
  B -- No --> C[400 error]
  B -- Yes --> D[Find article by URL in MongoDB]
  D --> E{Cached article exists?}
  E -- Yes --> F[Return cached result]
  E -- No --> G[Extract full article text]
  G --> H[Build lead and prompt body]
  H --> I[Run analyseAll and OpenAI in parallel]
  I --> J[Parse OpenAI JSON]
  J --> K[Compute sentiment label and reason]
  K --> L[Create MongoDB article]
  L --> M[Return analysis payload]
```

### Chat agent loop

```mermaid
sequenceDiagram
  participant U as User
  participant F as Frontend
  participant B as Backend
  participant DB as MongoDB
  participant O as OpenAI
  participant G as GNews

  U->>F: Send message
  F->>B: POST /api/chat
  B->>DB: Retrieve matching saved articles
  DB-->>B: Context set
  B->>O: Stream chat with tool definitions

  loop Until finish_reason is stop
    O-->>B: Text delta or tool call
    alt Tool call search_news
      B->>G: Search headlines
      G-->>B: Search results
      B->>O: Tool output
    else Tool call run_pulse
      B->>G: Search topic headlines
      G-->>B: Articles
      B->>B: Score article sentiment
      B->>O: Tool output
    else Text only
      B-->>F: SSE text event
    end
  end

  B-->>F: done event
```

### Sentiment pipeline

```mermaid
flowchart TD
  A[Article input] --> B[Lead pass]
  A --> C[Full-text pass]
  B --> D[RoBERTa lead score]
  C --> E[RoBERTa full-text score]
  D --> F[Weighted base]
  E --> F
  F --> G[Compute std dev]
  G --> H[Apply certainty dampening]
  H --> I{Local news model available?}
  I -- Yes --> J[Blend in 15 percent news-model score]
  I -- No --> K[Keep dampened score]
  J --> L{Toxicity above 0.7?}
  K --> L
  L -- Yes --> M[Cap score negative]
  L -- No --> N[Return consensus]
  M --> N
```

## Frontend request flow

### API helper

`frontend/src/utils/api.js`

Resolution order:

1. `VITE_API_URL`
2. `http://localhost:3001` when `VITE_LOCAL_MODELS=true`
3. `https://aries-smart-reviewer.onrender.com`

Exports:

- `API_BASE`
- `apiUrl(path)`
- `apiFetch(path, options)`

### Main consumers

- `App.jsx` for search, history, analyse, and pulse
- `AnalysisPanel.jsx` for related articles
- `ChatPage.jsx` for SSE chat
- `DataCollect.jsx` for bulk analysis

## Backend routes

### `GET /api/news`

File: `backend/routes/news.js`

- Validates `q`
- Calls GNews search
- Maps the response to the article-card shape used by the frontend

### `POST /api/analyse`

File: `backend/routes/analyse.js`

- Requires `url`
- Checks MongoDB cache first
- Attempts article extraction
- Builds a prompt body for OpenAI
- Runs `analyseAll()` and OpenAI in parallel
- Saves the result to MongoDB

Potential failure points:

- Mongo connection
- article extraction timeouts
- local sentiment model load/inference
- OpenAI response parsing

### `GET /api/pulse`

File: `backend/routes/pulse.js`

- Requires `q`
- Calls GNews search
- Runs `analyseAll()` sequentially for each result
- Sorts by score descending

Potential failure points:

- GNews timeout
- local model timeout or crash

### `GET /api/related`

File: `backend/routes/related.js`

- Requires `q`
- Searches GNews
- Excludes the current article URL
- Returns up to 5 results

### `POST /api/chat`

File: `backend/routes/chat.js`

- Requires `messages`
- Streams SSE events
- Retrieves article context from MongoDB
- Supports OpenAI tool calling
- Uses `search_news` and `run_pulse`

Event types:

- `text`
- `tool_start`
- `tool_end`
- `done`
- `error`

## Sentiment internals

File: `backend/sentiment.js`

### Models

- Xenova Twitter RoBERTa sentiment pipeline
- TensorFlow toxicity model
- optional local TensorFlow news model from disk

### Consensus logic

1. Score lead text.
2. Score full text.
3. Blend lead and full text with weights.
4. Reduce certainty when the two passes disagree.
5. Add the local news model if available.
6. Cap into negative territory when toxicity is very high.

### Startup behavior

`backend/index.js` preloads the sentiment model after MongoDB connects:

```js
loadSentimentModel().catch(err => console.warn('[sentiment] Preload failed:', err.message))
```

That means startup can succeed even if model preload fails, but later requests may still error if a route depends on `analyseAll()` and the model was never loaded correctly.

## Troubleshooting

### CORS errors on localhost

Usually not true CORS configuration bugs. Common causes:

- frontend is calling the hosted backend instead of local
- hosted backend is unhealthy and returning a non-Express error page

Check `frontend/src/utils/api.js` and your frontend env vars first.

### Intermittent 500 errors

Most likely causes in this codebase:

- MongoDB Atlas connectivity
- GNews API timeouts
- OpenAI failures
- RoBERTa model download/load failures

If `LOCAL_MODELS=true`, Pulse and Analyse are more fragile because they depend on local sentiment inference.

### Mongo timeout at startup

If the backend exits with:

```text
MongoDB connection error: Server selection timed out after 30000 ms
```

check:

- Atlas network access / IP allowlist
- database username and password
- `MONGODB_URI`
- general outbound network connectivity

## Data model

```js
Article {
  title: String,
  description: String,
  url: String,
  source: String,
  publishedAt: String,
  image: String,
  summary: String,
  sentiment: "positive" | "neutral" | "negative",
  sentimentScore: Number,
  sentimentReason: String,
  topics: [String],
  biasSummary: String,
  biasIndicators: [String],
  reviewerScores: [{ name, score, note }],
  analysedAt: Date
}
```

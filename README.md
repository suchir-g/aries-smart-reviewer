# Smart Reviewer

A full-stack news intelligence app. Search articles, analyse sentiment and bias, track topic coverage, and have an agentic conversation about the news — all in one place.

---

## What it does

- **Search & Analyse** — Find articles on any topic via GNews. Analyse any article to get an AI-generated summary, TensorFlow sentiment score, topic tags, bias indicators, and links to other sources covering the same story.
- **Topic Pulse** — Enter a topic and see how positively or negatively it's being covered right now across multiple sources, ranked and visualised on a scatter plot and diverging bar chart.
- **History** — Every article you analyse is saved to MongoDB. Browse your full analysis history and re-open any result.
- **Ask the News** — A sidebar chat assistant backed by OpenAI function calling + RAG. It can search live news, run sentiment pulse on a topic, and draw on your analysis history to answer questions.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React (Vite), plain CSS |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| Sentiment | TensorFlow.js Node — IMDB CNN model |
| AI / Summaries | OpenAI `gpt-4o-mini` |
| News data | GNews API |
| Streaming | Server-Sent Events (SSE) |
| Markdown | `react-markdown` + `remark-gfm` |

---

## Project structure

```
aries-smart-reviewer/
├── backend/
│   ├── index.js              # Express app, MongoDB connect, sentiment preload
│   ├── sentiment.js          # TensorFlow CNN sentiment model
│   ├── models/
│   │   └── Article.js        # Mongoose schema
│   └── routes/
│       ├── news.js           # GET  /api/news
│       ├── analyse.js        # POST /api/analyse
│       ├── pulse.js          # GET  /api/pulse
│       ├── related.js        # GET  /api/related
│       └── chat.js           # POST /api/chat  (SSE)
└── frontend/
    └── src/
        ├── App.jsx           # Routing, state, modal, chat sidebar
        ├── components/
        │   ├── Nav.jsx
        │   ├── Landing.jsx
        │   ├── SearchBar.jsx
        │   ├── ArticleCard.jsx
        │   ├── AnalysisPanel.jsx
        │   ├── HistoryTable.jsx
        │   ├── TopicPulse.jsx
        │   └── ChatPage.jsx
        └── utils/
            └── sentiment.js  # scoreToColour() helper
```

---

## Setup

### Prerequisites

- Node.js 18+
- A MongoDB Atlas cluster (free tier works fine)
- API keys for [GNews](https://gnews.io) and [OpenAI](https://platform.openai.com)

### Environment variables

Create `backend/.env`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>
OPENAI_API_KEY=sk-...
GNEWS_API_KEY=...
PORT=3001
```

### Install & run

**Backend:**
```bash
cd backend
npm install
npm run dev        # auto-restarts on file changes
```

On startup you should see:
```
Connected to MongoDB
[sentiment] TF model loaded
Server running on port 3001
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev        # Vite dev server at http://localhost:5173
```

---

## How it works

### Sentiment analysis

Sentiment is scored locally using TensorFlow.js with a CNN model trained on the IMDB dataset — no API call needed. The pipeline:

1. Tokenise the article title + description (lowercase, strip punctuation)
2. Map each word to its index in the model's vocabulary (OOV words → index 2)
3. Clamp any out-of-range indices to `vocabulary_size - 1` to avoid crashes
4. Pad the sequence to `max_len` (500 tokens)
5. Run a forward pass through the model → probability in [0, 1]
6. Map to a score in [−1, +1]: `score = probability * 2 − 1`

Scores above `+0.2` are classified positive, below `−0.2` negative, otherwise neutral.

The model is preloaded into memory when the server starts so the first request isn't slow.

### Article analysis (`POST /api/analyse`)

When you click **Analyse** on an article, two things run in parallel:

1. **TensorFlow** — scores sentiment from title + description
2. **OpenAI** (`gpt-4o-mini`) — returns a JSON object with:
   - `summary` (2–3 sentences)
   - `topics` (array of tags)
   - `biasSummary` (overall framing assessment)
   - `biasIndicators` (2–4 specific language patterns, e.g. *"uses 'regime' instead of 'government'"*)

Results are merged and saved to MongoDB. Subsequent requests for the same URL are served from cache instantly.

After the analysis modal opens, it also fires a background request to `/api/related` to populate the **Other Perspectives** section with articles from other sources on the same topic.

### Topic Pulse (`GET /api/pulse`)

Fetches up to 10 articles from GNews for a given topic, runs TensorFlow sentiment on all of them in parallel, sorts by score, and returns the results. Nothing is saved to the database — it's a live read-only view.

### Agentic chat (`POST /api/chat`)

The chat endpoint streams responses using Server-Sent Events. Each message goes through:

1. **RAG retrieval** — keywords from the user's message are used to search MongoDB for relevant articles from your history. Up to 6 matching articles are injected into the system prompt as context. If nothing matches, the 5 most recent analyses are used as fallback.

2. **OpenAI call** with two tools available:
   - `search_news(query)` — searches GNews for live articles
   - `run_pulse(topic)` — fetches and sentiment-scores articles on a topic

3. **Agentic loop** — if the model decides to call a tool, the tool is executed, the result is added to the message history, and the model is called again. This continues until the model produces a final text response.

4. **Streaming** — text deltas are forwarded to the client as `{ type: 'text', text: '...' }` SSE events. Tool invocations fire `tool_start` and `tool_end` events, which the frontend renders as inline status notes.

The frontend reads the SSE stream, updates the message state incrementally, and renders AI responses as markdown.

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/news?q=query` | Search GNews, returns up to 10 articles |
| `POST` | `/api/analyse` | Full analysis (TF sentiment + OpenAI). Cached by URL. |
| `GET` | `/api/history` | All analysed articles, newest first |
| `GET` | `/api/pulse?q=topic` | Live sentiment ranking for a topic |
| `GET` | `/api/related?q=topic&exclude=url` | Related articles from other sources |
| `POST` | `/api/chat` | Streaming SSE agentic chat |

### Article object (stored in MongoDB)

```js
{
  title, description, url, source, publishedAt, image,
  summary,           // AI-generated
  sentiment,         // "positive" | "neutral" | "negative"
  sentimentScore,    // number, -1.0 to +1.0
  sentimentReason,   // e.g. "TensorFlow CNN — confidence 91% positive"
  topics,            // string[]
  biasSummary,       // string
  biasIndicators,    // string[]
  analysedAt         // Date
}
```

---

## Design notes

- Typography: **Playfair Display** (headings) + **Lora** (body) — editorial/newspaper feel
- Colour palette: warm off-white `#FAFAF8` with muted borders, full dark mode support
- Sentiment colours: `#ef4444` (−1) → `#9ca3af` (0) → `#22c55e` (+1), interpolated continuously
- Grain overlay: fixed SVG `feTurbulence` noise texture at ~4% opacity for texture
- Landing hero: soft blurred colour blobs (amber, rose, sage) behind the headline
- Chat is a slide-in sidebar (420px) available on every page, not a separate route

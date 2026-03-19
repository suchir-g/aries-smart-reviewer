# Smart Reviewer — Claude Code Instructions

## What We're Building
A single-page web app where users search for news articles, trigger AI analysis (summary + sentiment), and view all past results stored in MongoDB.

**Stack:** React (Vite) + Node/Express + MongoDB Atlas + GNews API + Claude API

---

## Step 0: Get Your API Keys

Before writing any code, set up these three accounts:

### 1. GNews API (News Articles)
- Go to https://gnews.io and click **Get API Key**
- Sign up with your email (free tier gives 100 requests/day — more than enough)
- After signing in, your API key is on the dashboard homepage
- Copy it, you'll need it as: `GNEWS_API_KEY`

### 2. Anthropic API (AI Summary + Sentiment)
- Go to https://console.anthropic.com and sign up
- Go to **API Keys** in the left sidebar → click **Create Key**
- Name it "smart-reviewer" and copy the key immediately (you won't see it again)
- You'll need it as: `ANTHROPIC_API_KEY`
- Note: Anthropic gives new accounts $5 free credit — plenty for this project

### 3. MongoDB Atlas (Database)
- Go to https://www.mongodb.com/atlas and click **Try Free**
- Sign up and create a **free M0 cluster** (choose any region)
- When prompted to create a user: set a username and password — save these
- When prompted for IP access: click **Allow Access From Anywhere** (for development)
- Once the cluster is created, click **Connect** → **Drivers** → copy the connection string
- It looks like: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/`
- Replace `<password>` with your actual password
- You'll need it as: `MONGODB_URI`

---

## Step 1: Create Environment Files

Create `backend/.env` with:
```
GNEWS_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
MONGODB_URI=your_mongodb_uri_here
PORT=3001
```

Create `frontend/.env` with:
```
VITE_API_URL=http://localhost:3001
```

---

## Step 2: Build the Backend

In `backend/`, create `index.js` as the entry point. Build the following:

### File structure
```
backend/
├── index.js          # Express app setup + MongoDB connection
├── routes/
│   ├── news.js       # GET /api/news?q=query
│   └── analyse.js    # POST /api/analyse
├── models/
│   └── Article.js    # Mongoose schema
└── .env
```

### Routes to implement

**GET `/api/news?q=query`**
- Calls GNews API: `https://gnews.io/api/v4/search?q={query}&lang=en&max=10&apikey={GNEWS_API_KEY}`
- Returns array of articles (title, description, url, source, publishedAt, image)

**POST `/api/analyse`**
- Body: `{ title, description, url, source, publishedAt, image }`
- First check MongoDB — if this URL already exists, return the cached result (skip AI call)
- If not cached: call Anthropic API with a single prompt that returns BOTH summary and sentiment
- Use this prompt strategy (one call, two outputs):
  ```
  Analyse this news article and respond ONLY with a JSON object, no other text:
  {
    "summary": "2-3 sentence summary of the article",
    "sentiment": "positive" | "neutral" | "negative",
    "sentimentReason": "one sentence explaining the sentiment"
  }
  
  Article title: {title}
  Article description: {description}
  ```
- Save result to MongoDB and return it

**GET `/api/history`**
- Returns all analysed articles from MongoDB, sorted by newest first

### MongoDB Schema (Article.js)
Fields: `title`, `description`, `url` (unique), `source`, `publishedAt`, `image`, `summary`, `sentiment`, `sentimentReason`, `analysedAt`

### Notes
- Use `cors()` middleware so the frontend can call the backend
- Use `express.json()` middleware for parsing request bodies
- Connect to MongoDB at startup using `mongoose.connect()`

---

## Step 3: Build the Frontend

In `frontend/src/`, build a single-page app with these sections:

### File structure
```
frontend/src/
├── App.jsx               # Main layout
├── components/
│   ├── SearchBar.jsx     # Search input + button
│   ├── ArticleCard.jsx   # Card for each search result
│   ├── AnalysisPanel.jsx # Shows summary + sentiment for selected article
│   └── HistoryTable.jsx  # Table of all past analyses from MongoDB
├── api/
│   └── index.js          # All fetch calls to backend (searchNews, analyseArticle, getHistory)
└── main.jsx
```

### UI layout (single page, top to bottom)
1. **Header** — "Smart Reviewer" title
2. **Search bar** — text input + Search button
3. **Results grid** — cards showing article title, source, date, image. Each card has an "Analyse" button
4. **Analysis panel** — appears when an article is selected, shows summary, sentiment badge (colour-coded: green/grey/red), and sentiment reason
5. **History table** — always visible below, shows all past analyses (title, source, sentiment, date analysed). Clicking a row re-shows its analysis in the panel above

### State to manage
- `query` — current search input
- `articles` — array from GNews search
- `selectedArticle` — currently viewed article + its analysis
- `history` — array from MongoDB
- `loading` — boolean for any in-flight request
- `error` — string or null

### Behaviour
- On clicking "Analyse": call POST `/api/analyse`, show loading state on that card, then display result in the analysis panel
- If the article was already analysed (returned from cache), show a small "Cached" badge
- Refresh history table after every new analysis
- Handle errors gracefully (show error message, don't crash)

---

## Step 4: Run Locally

Terminal 1 (backend):
```bash
cd backend
npm run dev
```

Terminal 2 (frontend):
```bash
cd frontend
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:3001

---

## Step 5: Deploy

### Backend → Render
- Go to https://render.com → New → Web Service
- Connect your GitHub repo
- Set **Root Directory** to `backend`
- Build command: `npm install`
- Start command: `node index.js`
- Add all environment variables from `backend/.env` in the Render dashboard
- Copy the deployed URL (e.g. `https://smart-reviewer-api.onrender.com`)

### Frontend → Vercel
- Go to https://vercel.com → New Project → import your GitHub repo
- Set **Root Directory** to `frontend`
- Add environment variable: `VITE_API_URL=https://your-render-url.onrender.com`
- Deploy

---

## Summary of API Keys Needed

| Variable | Where to get it |
|---|---|
| `GNEWS_API_KEY` | gnews.io dashboard |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `MONGODB_URI` | MongoDB Atlas → Connect → Drivers |

---

## Extensions (if time allows)
- Sentiment trend chart using Recharts (plot sentiment over time for a repeated search topic)
- Export history table as CSV
- Search history saved in localStorage
- "Analyse All" button to queue all visible articles
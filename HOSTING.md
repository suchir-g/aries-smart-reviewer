# Hosting Guide

Frontend → **Vercel**
Backend → **Render**
Database → **MongoDB Atlas** (required by both)

---

## 1. MongoDB Atlas (do this first)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and create a free account.
2. Create a new **free tier (M0)** cluster.
3. Under **Database Access**, create a user with a username and password.
4. Under **Network Access**, add `0.0.0.0/0` (allow all IPs — needed for Render).
5. Click **Connect → Drivers** and copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Keep this — you'll need it for the backend env vars.

---

## 2. Backend on Render

### 2a. Prepare the repo

Render needs to know where the backend lives. If your repo root is the monorepo (`aries-smart-reviewer/`), Render will use the `backend/` subfolder.

Make sure `backend/package.json` has:
```json
"scripts": {
  "start": "node index.js"
}
```
It already does.

### 2b. Create a Web Service on Render

1. Go to [render.com](https://render.com) and sign in with GitHub.
2. Click **New → Web Service** and connect your repo.
3. Set the following:

| Setting | Value |
|---|---|
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install --legacy-peer-deps` |
| **Start Command** | `node index.js` |
| **Instance Type** | Free (or Starter for persistent memory) |

> ⚠️ **Important:** The TensorFlow models (`@tensorflow/tfjs-node`) need to download weights on first boot. The free tier has limited memory — if you hit OOM errors, upgrade to a Starter instance (512 MB RAM minimum recommended).

### 2c. Set environment variables

Under **Environment → Add Environment Variable**, add:

| Key | Value |
|---|---|
| `MONGODB_URI` | your Atlas connection string |
| `OPENAI_API_KEY` | your OpenAI API key |
| `GNEWS_API_KEY` | your GNews API key |
| `PORT` | `3001` (Render sets this automatically, but add it explicitly) |

### 2d. Deploy

Click **Create Web Service**. Render will install deps and start the server. Once it's live you'll get a URL like:
```
https://aries-smart-reviewer-api.onrender.com
```

Keep this URL — you need it for the frontend.

> **Note on cold starts:** The free tier spins down after 15 minutes of inactivity. The first request after that will be slow (~30s) while the TF models reload. Upgrade to Starter to keep it warm.

---

## 3. Frontend on Vercel

### 3a. Set the API URL

The frontend currently points to `http://localhost:3001`. Update it to your Render URL before deploying.

In `frontend/src/App.jsx`, change:
```js
const API = 'http://localhost:3001'
```
to your Render URL:
```js
const API = 'https://your-service-name.onrender.com'
```

Commit and push this change.

### 3b. Create a project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New → Project** and import your repo.
3. Set the following:

| Setting | Value |
|---|---|
| **Root Directory** | `frontend` |
| **Framework Preset** | `Vite` (auto-detected) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

No environment variables needed for the frontend (the API URL is baked in at build time).

### 3c. Deploy

Click **Deploy**. Vercel builds the Vite app and gives you a URL like:
```
https://aries-smart-reviewer.vercel.app
```

Future pushes to `main` will auto-redeploy.

---

## 4. CORS (if you hit errors)

If the browser blocks requests from your Vercel domain to Render, update `backend/index.js` to allow your frontend origin:

```js
app.use(cors({
  origin: 'https://your-app.vercel.app',
}));
```

Redeploy the backend after this change.

---

## Summary

| Service | URL pattern |
|---|---|
| Frontend | `https://your-app.vercel.app` |
| Backend | `https://your-app-api.onrender.com` |
| Database | MongoDB Atlas (no public URL needed) |

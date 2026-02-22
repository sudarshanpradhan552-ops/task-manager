# Deployment Guide — Single URL (Render.com)

Both the **Backend (FastAPI)** and **Frontend (React/Vite)** are served from a **single URL** on Render.com.

FastAPI serves the React build as static files, so you get **one link for everything**.

---

## How It Works

```
https://your-app.onrender.com/          → React Frontend (index.html)
https://your-app.onrender.com/assets/*  → React JS/CSS bundles
https://your-app.onrender.com/tasks/    → FastAPI API
https://your-app.onrender.com/token     → FastAPI Auth
```

---

## Step 1: Push Code to GitHub

Make sure your latest code is pushed:
```bash
git add .
git commit -m "Single URL deployment setup"
git push origin main
```

---

## Step 2: Deploy on Render.com

1. Go to [render.com](https://render.com) and log in
2. Click **New +** → **Web Service**
3. Connect your GitHub repository: `sudarshanpradhan552-ops/task-manager`
4. Configure the service:
   - **Name**: `ai-task-manager` (or anything you like)
   - **Root Directory**: *(leave blank)*
   - **Runtime**: `Python 3`
   - **Build Command**: `chmod +x build.sh && ./build.sh`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

5. **Environment Variables** (scroll to "Advanced"):

   | Key | Value |
   |-----|-------|
   | `SECRET_KEY` | A random secret string |
   | `OPENAI_API_KEY` | Your OpenAI API key |
   | `GOOGLE_API_KEY` | Your Gemini API key |
   | `GOOGLE_CLIENT_ID` | Your Google OAuth Client ID |
   | `DATABASE_URL` | Your PostgreSQL URL (see below) |
   | `VITE_API_URL` | Leave **blank** — same URL, no need! |

6. **Set up the Database**:
   - Open a new tab → Render Dashboard → **New +** → **PostgreSQL**
   - Create it (free tier is fine)
   - Copy the **Internal Database URL**
   - Go back to your Web Service → Environment Variables → add `DATABASE_URL` and paste it

7. Click **Create Web Service** and wait for build to complete (~3-5 minutes)

---

## Step 3: Done! 🎉

You'll get a single URL like:
```
https://ai-task-manager.onrender.com
```

Open it — **your React frontend loads**, and it **talks to your FastAPI backend** — all from the same URL!

---

## Free Tier Note

Render's free tier **spins down** after 15 minutes of inactivity.  
The first request after inactivity may take ~30 seconds to wake up.  
Upgrade to a paid plan ($7/mo) to keep it always on.

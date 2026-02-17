# Deployment Guide for AI Task Manager

Your project is ready to be deployed! We will deploy the **Backend** (Python) to **Render** and the **Frontend** (React) to **Vercel**.

## Prerequisites
1.  **GitHub Account**: You need to clear your code to a GitHub repository.
2.  **Accounts on Render.com & Vercel.com**: Both have free tiers.

---

## Part 1: Push Code to GitHub

1.  Initialize Git in your project folder (if not done):
    ```bash
    git init
    git add .
    git commit -m "Initial commit for deployment"
    ```
2.  Create a new repository on GitHub (e.g., `ai-task-manager`).
3.  Link and push:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/ai-task-manager.git
    git branch -M main
    git push -u origin main
    ```

---

## Part 2: Deploy Backend (Render)

1.  Log in to [Render.com](https://render.com).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository.
4.  Configure the service:
    *   **Name**: `ai-task-manager-api`
    *   **Root Directory**: Leave blank (it's the root).
    *   **Runtime**: **Python 3**.
    *   **Build Command**: `pip install -r requirements.txt`
    *   **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5.  **Environment Variables** (Scroll down to "Advanced"):
    *   Add `PYTHON_VERSION`: `3.11.0` (or whatever you use)
    *   Add `SECRET_KEY`: (Generate a random string)
    *   Add `OPENAI_API_KEY`: Your OpenAI Key.
    *   **Database**: Render provides a **PostgreSQL** database. 
        *   Open a new tab, go to Render Dashboard -> **New +** -> **PostgreSQL**.
        *   Create it, copy the **Internal Database URL**.
        *   Go back to your Web Service env vars, add `DATABASE_URL` and paste the value.
6.  Click **Create Web Service**.
7.  Wait for deployment. Once live, copy the **Service URL** (e.g., `https://ai-task-manager-api.onrender.com`).

---

## Part 3: Deploy Frontend (Vercel)

1.  Log in to [Vercel.com](https://vercel.com).
2.  Click **Add New...** -> **Project**.
3.  Import your GitHub repository.
4.  Configure the project:
    *   **Framework Preset**: **Vite**.
    *   **Root Directory**: Click "Edit" and select `task-manager` (the folder containing your frontend).
5.  **Environment Variables**:
    *   Add `VITE_API_URL`: Paste your **Render Backend URL** (no trailing slash, e.g., `https://ai-task-manager-api.onrender.com`).
6.  Click **Deploy**.

---

## Completion
Once Vercel finishes, you will get a live URL (e.g., `https://ai-task-manager.vercel.app`). Open it, and your full stack app should be working live!

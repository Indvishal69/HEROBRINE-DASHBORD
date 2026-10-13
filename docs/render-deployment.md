# Deploying Minecraft Nexus AI to Render

This step-by-step guide explains how to deploy Minecraft Nexus AI to [Render](https://render.com) for 24/7 autonomous uptime.

---

## 1. Quick Deploy via Blueprint (`render.yaml`)

Because this repository includes a pre-configured `render.yaml`, you can deploy it in a few clicks:

1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub repository:
   ```
   https://github.com/Indvishal69/HEROBRINE-DASHBORD.git
   ```
4. Render will parse `render.yaml` and configure the web service automatically.
5. Provide your environment variables (e.g., `GROQ_API_KEY` or `OPENROUTER_API_KEY`).
6. Click **Apply**.

---

## 2. Manual Web Service Configuration

If creating a Web Service manually:

1. Click **New +** → **Web Service**.
2. Select your repository `HEROBRINE-DASHBORD`.
3. Configure the service settings:
   - **Name**: `minecraft-nexus-ai`
   - **Environment**: `Node`
   - **Region**: Closest to your Minecraft server (e.g. Frankfurt, Oregon, Ohio, Singapore)
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Instance Type**: Free or Starter (Starter recommended for persistent memory)

---

## 3. Environment Variables Configuration

In your Web Service **Environment** tab, set:

| Key | Recommended Value | Notes |
|---|---|---|
| `NODE_VERSION` | `22` | Requires Node 22+ for built-in `node:sqlite` |
| `PORT` | `3000` | Render will bind its HTTP router to this port |
| `DASHBOARD_PASSWORD` | `your_secure_password` | Password to access the web UI |
| `NEXUS_MASTER_KEY` | *(Generate a 64-char hex string)* | E.g., `openssl rand -hex 32` |
| `MC_HOST` | `phantomhorizon549.mcsh.io` | Minecraft server host |
| `MC_PORT` | `25565` | Minecraft server port |
| `MC_AUTH` | `offline` | `offline` or `microsoft` |
| `MC_USERNAME` | `AIBuddy` | Bot in-game username |
| `GROQ_API_KEY` | `gsk_...` | Your Groq API key |
| `OPENROUTER_API_KEY` | `sk-or-...` | Optional alternate API key |

---

## 4. Persistent Disk (Recommended)

Render web services have ephemeral filesystems on the free tier. To ensure `nexus.db` (tasks, permissions, credentials, blueprints) persists across restarts and redeploys:

1. In the service settings, go to **Disks**.
2. Click **Add Disk**:
   - **Name**: `nexus-data`
   - **Mount Path**: `/opt/render/project/src/data` (or set `DATA_DIR=/data` in env and mount `/data`)
   - **Size**: 1 GB

---

## 5. Verifying Deployment

1. Check the Render deployment logs. You should see:
   ```
   [Nexus] Initialized SQLite database at data/nexus.db
   [Nexus] Dashboard listening on http://0.0.0.0:3000
   [Bot] Connecting to phantomhorizon549.mcsh.io:25565 (offline) as AIBuddy...
   [Bot] Successfully spawned in world!
   ```
2. Open your Render web service URL (`https://minecraft-nexus-ai.onrender.com`).
3. Enter your `DASHBOARD_PASSWORD` to unlock the live control center and 3D viewer.

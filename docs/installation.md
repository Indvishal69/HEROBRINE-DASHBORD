# Minecraft Nexus AI — Installation & Setup Guide

This guide covers setting up **Minecraft Nexus AI** locally on **Windows** and **Linux/macOS**.

---

## 1. Prerequisites

- **Node.js**: Version **22.5.0+** (Recommended: **Node.js 22 LTS** or **Node.js 24**).
  - *Why Node 22+?* Minecraft Nexus AI leverages native `node:sqlite` (`DatabaseSync`), eliminating the need for Python or C++ native build toolchains (`node-gyp`).
- **npm**: Version **10+** (included with Node.js).
- **Minecraft Server**: Java Edition **1.21.x** (Paper, Purpur, or Spigot recommended).

---

## 2. Clone the Repository

```bash
git clone https://github.com/Indvishal69/HEROBRINE-DASHBORD.git
cd HEROBRINE-DASHBORD
```

---

## 3. Environment Configuration

Copy `.env.example` to `.env`:

```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```

### Key Configuration Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port for the Express dashboard & Socket.IO server | `3000` |
| `VIEWER_PORT` | Internal port for Prismarine 3D Viewer | `3007` |
| `DASHBOARD_PASSWORD` | Access password for the web control panel | `buddy123` |
| `NEXUS_MASTER_KEY` | 32-byte hexadecimal master key for AES-256-GCM encryption | *(Auto-generated if absent)* |
| `MC_HOST` | Minecraft server address | `phantomhorizon549.mcsh.io` |
| `MC_PORT` | Minecraft server port | `25565` |
| `MC_VERSION` | Target protocol version (e.g. `1.21.1` or `false` for auto) | `1.21.1` |
| `MC_AUTH` | `offline` (cracked/local) or `microsoft` (online mode) | `offline` |
| `MC_USERNAME` | Bot username | `AIBuddy` |
| `GROQ_API_KEY` | Optional initial Groq API key | *(Empty)* |
| `OPENROUTER_API_KEY` | Optional initial OpenRouter API key | *(Empty)* |
| `OPENAI_API_KEY` | Optional initial OpenAI API key | *(Empty)* |

---

## 4. Install Dependencies & Build

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build
```

---

## 5. Running the Application

### Development Mode (with hot-reload / ts execution)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Once running, access the dashboard in your web browser:
```
http://localhost:3000
```
Default password: `buddy123`

---

## 6. Running the Automated Test Suite

Run the built-in test suite to verify encryption, database persistence, blueprint calculations, and intent parsing:

```bash
npm test
```
All 11 tests will execute in under a second using Node's native test runner (`node --test`).

---

## 7. Troubleshooting

- **Node Version Error:** Ensure `node -v` prints `v22.x.x` or higher.
- **Port Conflict (3000 or 3007):** Change `PORT` or `VIEWER_PORT` in your `.env` file.
- **Bot Cannot Connect to Server:**
  - Verify if server is running in `online-mode=false` when using `MC_AUTH=offline`.
  - For Paper/Spigot 1.21.x servers, ensure `MC_VERSION=1.21.1`.

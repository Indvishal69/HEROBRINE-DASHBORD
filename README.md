# 🎮 Minecraft Nexus AI — Professional Autonomous SMP Player

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.21.x%20Java-red.svg)](https://www.minecraft.net/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-25%2F25%20Passing-brightgreen.svg)]()

**Minecraft Nexus AI** is an enterprise-grade, fully autonomous virtual player for Minecraft Java Edition **1.21.x** (Paper, Purpur, Spigot). Built with Node.js LTS, TypeScript, Mineflayer, and Prismarine 3D Viewer, it perceives the game world, understands player requests, plans actions, mines, crafts, farms, stores resources, and executes architectural blueprints with millimeter accuracy.

Includes a cyberpunk-inspired dark graphite & emerald browser control center with a **live 3D world viewer**, real-time HUD telemetry, and WASD manual override controls.

---

## 🌟 Key Features

| Subsystem | Capabilities |
|---|---|
| **Live 3D World Viewer** | Real-time browser rendering of loaded chunks, entities, and bot orientation via Prismarine Viewer reverse-proxied at `/viewer/`. |
| **Multi-Key AI Pool & Router** | Up to 5 API keys with **AES-256-GCM** encryption at rest, automatic HTTP 429 rate-limit failover, Retry-After backoff, and complexity-based model routing. |
| **Provider Presets** | Instant presets for Groq (`llama-3.3-70b-versatile`), OpenRouter, OpenAI (`gpt-4o-mini`), Together AI, Fireworks AI, and custom endpoints. |
| **Advanced PvP Combat AI** | Deterministic 7-state machine (`IDLE` through `RECOVERY`), 1.21.x weapon attack cooldown (~625ms for sword), offhand shield blocking, strict allowlists, and emergency retreat. |
| **Smart Food & Survival** | Real 1.21.x metadata catalog, saturation scoring, 10-step safe eating controller, 4-tier survival hierarchy (A: Critical through D: Long-term), and 20-min food forecasting. |
| **Authoritative Action Coordinator** | Unified preemption locks ensuring absolute priority ordering (Emergency > Manual Override > Combat Recovery > Engage > Eat > Tasks). |
| **6-Tier Autonomy Governor** | Enforces Autonomy Levels 0 to 5 (`OBSERVE` to `EXPERT MODE`), quiet hours scheduling, and unattended timeout guards. |
| **Long-Horizon Campaign Planner** | Directed milestone dependency graphs for survival progression (starter base, storage network, renewable food) with automated retry budgets. |
| **Build Transactions & Rollback** | Full block change journaling during construction with conflict-detection preventing overwrite of player-built modifications. |
| **World Intelligence & Travel** | Persistent spatial memory, freshness TTL, nearest-landmark sorting, Nether 8:1 coordinate math, and pre-travel checklists. |
| **Autonomous Sub-Engines** | Mining with tool-affinity matching, recipe craft solver, mature crop farming & replanting, and categorized chest storage. |
| **Blueprint Construction** | Bottom-up layer placement with automated material manifest calculations and live discrepancy repair. |
| **In-Game Chat Defense** | Role-based permissions (Admin, Trusted, Visitor, Blocked) and strict XML-delimited prompt injection isolation. |
| **Zero Native Dependencies** | Native `node:sqlite` database with built-in schema migration; zero C++ compile steps on Windows or Render. |
| **Manual WASD Control** | Real-time keyboard movement and jump controls that gracefully suspend AI pathfinding to prevent conflicts. |

---

## 🚀 Quick Start

### 1. Requirements
- **Node.js 22.5.0+** (or Node 24).
- A Minecraft Java Edition **1.21.x** server (e.g. Paper/Spigot).

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Indvishal69/HEROBRINE-DASHBORD.git
cd HEROBRINE-DASHBORD

# Install dependencies
npm install

# Compile TypeScript
npm run build
```

### 3. Configure Environment
Create a `.env` file from the example:
```bash
# Windows
Copy-Item .env.example .env

# Linux / Mac
cp .env.example .env
```
Default configuration connects to `phantomhorizon549.mcsh.io:25565` (offline mode) with bot username `AIBuddy`.

### 4. Run the Application
```bash
# Production mode
npm start

# Or development mode
npm run dev
```

Open your browser at **`http://localhost:3000`** and log in with password **`buddy123`**.

---

## 🧪 Automated Testing

Verify cryptography, SQLite persistence, blueprint math, combat state machines, food metadata, action locks, autonomy gates, and rollback transactions with Node's native test runner:

```bash
npm test
```
```
▶ 1. Security & Cryptography Suite (2 tests)
▶ 2. Persistent SQLite Database Suite (3 tests)
▶ 3. Construction & Blueprint Engine Suite (1 test)
▶ 4. Chat Intent Parser & Security Suite (3 tests)
▶ 5. AI Provider Presets Suite (2 tests)
▶ 1. Advanced PvP Combat AI Suite (3 tests)
▶ 2. Smart Food & Hunger System Suite (3 tests)
▶ 3. Authoritative Action Coordinator Suite (1 test)
▶ 4. Autonomy Levels & Safety Suite (2 tests)
▶ 5. Build Transactions & Conflict-Safe Rollback Suite (2 tests)
▶ 6. World Intelligence & Multi-Agent Suites (3 tests)
ℹ tests 25
ℹ suites 11
ℹ pass 25
ℹ fail 0
```

---

## 📚 Technical Documentation

- [📖 Installation & Local Setup Guide](docs/installation.md)
- [🏛️ Architecture & Component Design](docs/architecture.md)
- [⚔️ PvP Combat & Smart Food/Survival Subsystem](docs/combat-survival.md)
- [🌍 Autonomy Levels, Campaigns & World Intelligence](docs/autonomy-campaigns.md)
- [🔒 Security Model & Prompt Injection Defense](docs/security.md)
- [☁️ Deploying to Render (24/7 Hosting)](docs/render-deployment.md)

---

## 🌐 Deploy to Render

Deploy Nexus AI directly to [Render](https://render.com) using the included `render.yaml`:

1. Fork or push this repository to GitHub.
2. In Render, select **New +** → **Blueprint** and select your repo.
3. Configure your API keys (e.g. `GROQ_API_KEY`) and deploy!

For complete step-by-step instructions, see the [Render Deployment Guide](docs/render-deployment.md).

---

## 🛡️ License

Released under the [MIT License](LICENSE).

# AI maintainer guide

This guide is for an AI coding assistant or developer who receives this folder and must understand how to run, maintain, or extend it. Read `README.md` first for the player's install and operating steps.

## Purpose and architecture

Minecraft AI Buddy is a local Minecraft Java Edition bot plus a browser control room. `src/index.js` starts one Mineflayer client, exposes its actions through an MCP server over **stdio**, and starts the dashboard. `src/dashboard.js` serves the dashboard on loopback and sends live updates through Socket.IO. `public/index.html` contains the UI, live POV iframe, and browser-side controls. `setup.ps1` installs Node packages and registers the same MCP entry with Codex and Antigravity.

There are two separate AI paths:

1. Codex or Antigravity uses MCP tools to inspect and control the bot.
2. The optional API provider connection in the dashboard can answer in-game chat messages that begin with a configured prefix. It does not receive every message and cannot call Minecraft controls.

The bot, dashboard, and POV viewer run locally. The dashboard binds to `127.0.0.1` on port 3080 by default; the viewer uses 3007. MCP stdout is reserved for protocol data, so diagnostic logs must use stderr (`console.error`).

## Start and setup

Requirements: Node.js 22 or newer and Windows PowerShell. From this directory:

```powershell
npm ci
node .\src\index.js
```

The second command is intended for local diagnosis; normal use is through the MCP host so stdio stays attached. For an end-user install, run `setup.ps1`, restart the chosen AI host, then run `open-gui.ps1`. Keep the project folder at its setup location because the hosts store its absolute path.

The setup script installs packages only when required packages are missing. It registers `minecraft-buddy` through the Codex CLI when available. It also merges `minecraft-ai-buddy` into `%USERPROFILE%\.gemini\config\mcp_config.json` under `mcpServers`, preserving other Antigravity server entries and root config fields. It must not overwrite invalid JSON or an unexpected non-object `mcpServers` value. Antigravity expects a stdio entry with `command`, `args`, and `cwd`.

Both hosts can be configured, but users should run one at a time. Each MCP host starts its own process, bot connection, and local web ports.

## MCP interface

The `McpServer` in `src/index.js` registers Minecraft tools through the local `register` helper. `toolActions` stores the shared implementation so dashboard controls and MCP tools execute the same action.

Current tool groups:

- Connect and inspect: `minecraft_connect`, `minecraft_status`, `minecraft_recent_chat`.
- Chat: `minecraft_chat` (normal messages only; slash commands are rejected).
- Movement and camera: `minecraft_move_to`, `minecraft_follow_player`, `minecraft_look_at`, `minecraft_look`, `minecraft_press_control`, `minecraft_stop`.
- Inventory/world actions: `minecraft_use_item`, `minecraft_inspect_block`, `minecraft_search_blocks`, `minecraft_mine_block`, `minecraft_place_block`.
- Lifecycle: `minecraft_disconnect`.

Keep input schemas bounded. Keep actions close to the bot and server rules; do not remove checks on world bounds, movement distances, mine/place range, slash-command blocking, or chat length without a reasoned replacement.

## AI provider bridge

The dashboard accepts a base URL, a model ID, and a key for any provider that implements the OpenAI-compatible `POST /chat/completions` interface. The configured base URL excludes `/chat/completions`. Requests use a bearer Authorization header and JSON `model`, `messages`, and `max_tokens` fields. This is not universal compatibility with every AI vendor; incompatible APIs require a provider-specific adapter.

Security and behavior requirements:

- Keep the API key only in the Node process memory (`aiApiKey`). Do not persist it in `.env`, `data`, browser storage, MCP config, logs, or dashboard state.
- `/api/ai/connect` tests the provided credentials before marking the connection active. The test prompt can incur provider billing.
- `/api/ai/disconnect` clears the in-memory key. Restarting the process also clears it.
- Persist only base URL, model ID, trigger prefix, and the auto-reply boolean in `data/ai-settings.json`.
- Validate remote base URLs as HTTPS. Permit HTTP only for loopback/local model endpoints. Do not accept credentials or query strings in the base URL.
- Auto-reply is opt-in and disabled by default. It only sends a message to the provider if an incoming player message starts with the configured trigger (default `@buddy`). Rate-limit calls and limit user prompt/reply lengths.
- The game chat is public and untrusted. Treat it as user text, ask the model only for short ordinary chat, and never let this feature invoke bot tools or send slash commands.
- Never return provider credentials or request headers in `/api/state`, Socket.IO events, or logs.
- Document provider billing and that only triggered chat is transmitted.

Relevant functions in `src/index.js`: `validateAISettings`, `persistAISettings`, `aiStatus`, `requestAI`, `connectAI`, `saveAIOptions`, `disconnectAI`, and `maybeReplyToGameChat`. Dashboard routes are in `src/dashboard.js`; input fields and status rendering are in `public/index.html`.

## Persistent settings and secrets

`data/settings.json` stores Minecraft server login preferences such as host, port, version, and username. It is ignored by git. The auth mode is Microsoft or server-permitted offline login; Microsoft tokens are managed by Mineflayer's auth dependency under its local auth cache.

`data/ai-settings.json` stores non-secret AI options only. `.gitignore` excludes `data/`, `.env`, and `node_modules/`. Keep that exclusion. Do not add API keys to the sample `.env.example` or the MCP configuration.

## Local dashboard API

- `GET /api/state` returns bot, inventory, game chat, Minecraft settings, safe AI connection metadata, and viewer URL. It must never include the API key.
- `POST /api/settings` stores Minecraft connection settings.
- `POST /api/tool/:name` runs one registered MCP action.
- `POST /api/ai/connect` verifies a provider and retains the supplied API key in process memory.
- `POST /api/ai/settings` stores non-secret provider/trigger settings.
- `POST /api/ai/disconnect` clears the in-memory key.

The server binds to loopback and dashboard routes enforce a same-origin check. Preserve this restriction. No dashboard route should accept requests from arbitrary remote origins.

## Maintenance workflow

1. Read `README.md` and this file before changing setup, login, or key handling.
2. Check `package.json` and `package-lock.json` together when adding/removing dependencies.
3. Keep setup repeatable. Avoid running `npm ci` while a host process may be using `node_modules`; setup currently skips reinstall if packages exist and warns when packages are missing while the bot is running.
4. Preserve existing Antigravity `mcpServers` entries and unrelated root config when updating its config file.
5. Update `README.md` for player-facing steps and this file when architecture, contracts, security rules, or maintenance procedures change.
6. Keep the final zip synchronized with the project source, README files, and package lock. Never include `node_modules`, `.env`, `.auth`, or `data`.

## Troubleshooting hints

- `open-gui.ps1` expects the dashboard to already be running. The chosen MCP host must be open with this server enabled.
- A second host process may fail to bind ports 3080 or 3007. Close the other host's server first.
- An API connection error usually means the endpoint path, model ID, key, provider account, or compatibility differs. Check the provider's own Chat Completions docs.
- A PowerShell EBUSY unlink error means another process has a package file open. Close Codex/Antigravity and Node processes using this folder before reinstalling.
- The Antigravity global MCP config path is `%USERPROFILE%\.gemini\config\mcp_config.json`. The official config uses a top-level `mcpServers` object; each local stdio entry accepts `command`, `args`, and `cwd`.

# Minecraft AI Buddy

Minecraft AI Buddy is a free, local control panel for a Minecraft **Java Edition** bot. It shows the bot's first-person view, server chat, health, hunger, and inventory. You can drive it from the dashboard, or connect its MCP tools to Codex or Google Antigravity.

The dashboard and bot software are free. Connecting an online AI provider may cost money, depending on that provider and your API plan.

## What you need

- Windows 10 or 11
- Node.js 22 or newer
- Minecraft Java Edition server address, port, and a login the server accepts
- Optional: an API key for a provider that supports the OpenAI-compatible **Chat Completions** API
- Optional: Codex or Google Antigravity, to let its AI use the Minecraft MCP tools

The bot joins the server as its own Minecraft player. It does not control your personal Minecraft character. Microsoft login requires an account that owns Java Edition. Offline login only works on servers that allow offline-mode clients.

## Install

1. Extract the `minecraft-ai-buddy` folder somewhere you can keep it, such as Documents. Do not move it after setup, because Codex and Antigravity save the folder path.
2. Install Node.js 22 or newer from [nodejs.org](https://nodejs.org/).
3. Open PowerShell in the extracted `minecraft-ai-buddy` folder.
4. Run:

   ```powershell
   .\setup.ps1
   ```

   If PowerShell blocks the script, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File ".\setup.ps1"
   ```

   Setup installs the packages and adds the MCP server to Codex (when its command is available) and Antigravity's global MCP configuration. It preserves other Antigravity MCP entries.

5. Fully quit and reopen the AI host you plan to use: Codex **or** Antigravity. Setup does not launch the bot by itself; the AI host starts the MCP server.
6. Open PowerShell in the same folder and run:

   ```powershell
   .\open-gui.ps1
   ```

   Or browse to [http://127.0.0.1:3080](http://127.0.0.1:3080). If it says the buddy is not running, make sure Codex or Antigravity is open and its `minecraft-ai-buddy` MCP server is enabled.

## Join a Minecraft server

1. In **Server setup**, enter the Java server's IP or domain and port.
2. Pick the server version, or leave it as `auto`. Choose **Microsoft** for an authenticated server, or **Offline / LAN** only for a server that permits offline clients. Set the bot account label.
3. Click **Save**, then **Connect bot**. Complete the Microsoft device-code sign-in in the browser if it appears.
4. The bot POV appears in the middle panel. Incoming and outgoing messages appear in **In-game messages**.

Both the dashboard and POV viewer listen only on this PC, at ports `3080` and `3007`. Keep those ports free. The dashboard works without an API key.

## Connect an AI API key

1. In **Connect your API**, enter the provider's OpenAI-compatible API base URL and exact model ID.
2. Paste an API key into the password field and click **Test & connect**. This sends a tiny test request to confirm the URL, key, and model work together. Depending on the provider, that request may be billable.
3. Turn on **Reply to triggered in-game messages** and save. This setting is off by default.
4. In Minecraft chat, address the bot with the chosen prefix, by default:

   ```text
   @buddy hello, what can you see?
   ```

Only messages that start with the trigger are sent to the provider. The AI makes a short chat reply; it cannot move or operate the bot through this API chat feature. Codex or Antigravity can use the separate MCP controls for movement and world actions.

This accepts **OpenAI-compatible Chat Completions** endpoints. A key for an incompatible provider does not work just by pasting it: that provider needs to offer a compatible endpoint or have a dedicated adapter added. Put the provider's API base URL in the field, ending before `/chat/completions`; do not put your key in the URL. Remote API URLs must use HTTPS. Local HTTP endpoints such as a local model server are allowed.

Your key stays in the running server's memory and is not written to settings, sent to the browser after entry, or included in the MCP config. It is cleared when you press **Clear key** or restart/close the MCP server. The base URL, model name, reply prefix, and on/off choice are saved locally in `data/ai-settings.json`. The provider receives the test request and only the game messages that start with your trigger. Review that provider's privacy and billing terms.

## Dashboard controls

- **Live view:** first-person camera from the bot.
- **Movement:** hold the on-screen controls or use `W A S D`, `Space`, `Shift`, and `Ctrl`; arrow keys look around. Use **Stop** to release controls.
- **Chat:** read server messages and send normal in-game chat. Slash commands are blocked.
- **Quick actions:** walk to nearby coordinates, follow a visible player, search and inspect blocks, mine or place nearby blocks, and look at a point.
- **AI provider:** connect/test a compatible model, clear the key, and choose whether prefixed server messages receive an AI reply.

Mining and placing are limited to nearby blocks. Walking is limited to nearby targets per action. The bot must be connected before game controls work.

## Use in Codex or Antigravity

After setup and restarting the selected host, ask its AI to use the Minecraft Buddy MCP tools. Examples:

- “Connect to my Minecraft server and tell me your position.”
- “Read the latest game chat and reply to Vishal.”
- “Follow player Vishal.”

The MCP tool names include `minecraft_connect`, `minecraft_status`, `minecraft_recent_chat`, `minecraft_chat`, `minecraft_move_to`, `minecraft_follow_player`, `minecraft_look_at`, `minecraft_look`, `minecraft_press_control`, `minecraft_use_item`, `minecraft_inspect_block`, `minecraft_search_blocks`, `minecraft_mine_block`, `minecraft_place_block`, `minecraft_stop`, and `minecraft_disconnect`.

Setup registers with both hosts, but **use one AI host at a time**. Each host can start its own bot process, and both would compete for the same local dashboard and POV ports. In Antigravity, the entry is added to `%USERPROFILE%\.gemini\config\mcp_config.json`; restart Antigravity and enable/refresh `minecraft-ai-buddy` in its MCP Servers settings if it does not show immediately. See [Google's Antigravity MCP setup guide](https://antigravity.google/docs/mcp) for its current configuration and UI steps.

## Settings and troubleshooting

- Minecraft server settings are stored on this PC in `data/settings.json`.
- AI provider URL, model, trigger, and auto-reply choice are in `data/ai-settings.json`. API keys are never stored there.
- If the dashboard does not open, restart Codex or Antigravity, ensure the MCP server is enabled, then run `open-gui.ps1` again.
- If setup reports a locked file, fully quit Codex and Antigravity, close any Node process running this folder, then run `setup.ps1` again.
- If the bot cannot join, check Java Edition, address, port, version, server whitelist, firewall, and login mode.
- If POV is blank, reconnect the bot and make sure local port `3007` is available.
- If the API test fails, check the base URL, key, model ID, provider balance/limits, and that its endpoint supports OpenAI-compatible Chat Completions.
- If Antigravity setup says the config is invalid, setup leaves that file alone. Fix the JSON at `%USERPROFILE%\.gemini\config\mcp_config.json` and rerun `setup.ps1`.

## Project files

- `setup.ps1` — install packages and register Codex/Antigravity MCP entries.
- `open-gui.ps1` — open the local dashboard after the MCP server is running.
- `src/index.js` — Mineflayer bot, MCP tools, POV, settings, and optional AI provider bridge.
- `src/dashboard.js` and `public/index.html` — local HTTP dashboard and controls.
- `AI_README.md` — implementation guide for an AI coding assistant maintaining this project.

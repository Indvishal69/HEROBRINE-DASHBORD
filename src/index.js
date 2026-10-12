import dotenv from "dotenv";
import dns from "node:dns";
import fs from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import mineflayer from "mineflayer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pathfinderPackage from "mineflayer-pathfinder";
import viewerPackage from "prismarine-viewer";
import Vec3 from "vec3";
import { z } from "zod";
import { startDashboard } from "./dashboard.js";

const dnsHostCache = new Map([
  ["phantomhorizon549.mcsh.io", "198.244.228.170"]
]);

const originalDnsLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  originalDnsLookup(hostname, options, (err, address, family) => {
    if (err && dnsHostCache.has(hostname)) {
      const cachedIp = dnsHostCache.get(hostname);
      if (options?.all) return callback(null, [{ address: cachedIp, family: 4 }]);
      return callback(null, cachedIp, 4);
    }
    if (!err && typeof address === "string") {
      dnsHostCache.set(hostname, address);
    }
    callback(err, address, family);
  });
};

const { pathfinder, Movements, goals } = pathfinderPackage;
const { GoalNear, GoalFollow } = goals;
const { mineflayer: mineflayerViewer } = viewerPackage;
const MAX_COORD = 30_000_000;
const recentChat = [];
const toolActions = new Map();
const settingsPath = fileURLToPath(new URL("../data/settings.json", import.meta.url));
const aiSettingsPath = fileURLToPath(new URL("../data/ai-settings.json", import.meta.url));

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), override: true });

const GUI_PORT = Number(process.env.PORT || process.env.MC_GUI_PORT || 3080);
const VIEWER_PORT = Number(process.env.MC_VIEWER_PORT || 3007);

// MCP stdio reserves stdout for protocol messages; some viewer dependencies log there.
console.log = (...args) => console.error(...args);

const runtimeSettings = {
  host: process.env.MC_HOST || "",
  port: Number(process.env.MC_PORT || 25565),
  version: process.env.MC_VERSION || "auto",
  auth: process.env.MC_AUTH || "offline",
  username: process.env.MC_USERNAME || "MinecraftBuddy"
};
try {
  Object.assign(runtimeSettings, JSON.parse(await fs.readFile(settingsPath, "utf8")));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const PROVIDER_PRESETS = {
  openrouter: {
    id: "openrouter",
    name: "OpenRouter (Recommended)",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Fast & Smart)" },
      { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (Free)" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash" },
      { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct" }
    ]
  },
  groq: {
    id: "groq",
    name: "Groq (Ultra-Fast)",
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Free & Recommended)" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
      { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B" },
      { id: "gemma2-9b-it", name: "Gemma 2 9B" }
    ]
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini (OpenAI Format)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" }
    ]
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" }
    ]
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local / Offline)",
    baseUrl: "http://localhost:11434/v1",
    models: [
      { id: "llama3.2", name: "Llama 3.2" },
      { id: "mistral", name: "Mistral" },
      { id: "qwen2.5", name: "Qwen 2.5" }
    ]
  },
  custom: {
    id: "custom",
    name: "Custom Provider",
    baseUrl: "",
    models: []
  }
};

const aiSettings = {
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "deepseek/deepseek-chat",
  autoReply: true,
  trigger: "@buddy"
};
try {
  const loaded = JSON.parse(await fs.readFile(aiSettingsPath, "utf8"));
  if (!loaded.provider) {
    if (loaded.baseUrl?.includes("generativelanguage.googleapis.com")) loaded.provider = "gemini";
    else if (loaded.baseUrl?.includes("api.groq.com")) loaded.provider = "groq";
    else if (loaded.baseUrl?.includes("api.openai.com")) loaded.provider = "openai";
    else if (loaded.baseUrl?.includes("localhost:11434")) loaded.provider = "ollama";
    else if (loaded.baseUrl?.includes("openrouter.ai")) loaded.provider = "openrouter";
  }
  Object.assign(aiSettings, loaded);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

let bot = null;
let connectPromise = null;
let botState = "disconnected";
let lastError = null;
let viewerActive = false;
let dashboard = null;
let aiApiKeys = [];
let activeKeyIndex = 0;
if (process.env.OPENROUTER_API_KEY) {
  aiApiKeys.push(process.env.OPENROUTER_API_KEY);
} else if (process.env.GEMINI_API_KEY) {
  aiApiKeys.push(process.env.GEMINI_API_KEY);
  aiSettings.provider = "gemini";
  aiSettings.baseUrl = PROVIDER_PRESETS.gemini.baseUrl;
  aiSettings.model = PROVIDER_PRESETS.gemini.models[0].id;
} else if (process.env.GROQ_API_KEY) {
  aiApiKeys.push(process.env.GROQ_API_KEY);
  aiSettings.provider = "groq";
  aiSettings.baseUrl = PROVIDER_PRESETS.groq.baseUrl;
  aiSettings.model = PROVIDER_PRESETS.groq.models[0].id;
} else if (process.env.OPENAI_API_KEY) {
  aiApiKeys.push(process.env.OPENAI_API_KEY);
}
let aiConnected = aiApiKeys.length > 0;
let aiLastError = null;
let aiReplyInProgress = false;
let lastAIReplyStartedAt = 0;

const server = new McpServer({
  name: "minecraft-ai-buddy",
  version: "1.0.0"
});

function text(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function register(name, description, schema, action) {
  const validator = z.object(schema);
  toolActions.set(name, async (args = {}) => action(validator.parse(args)));
  server.tool(name, description, schema, async (args) => {
    try {
      return text(await toolActions.get(name)(args));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Minecraft bot error: ${message}` }], isError: true };
    }
  });
}

function validateSettings(input) {
  const host = String(input?.host ?? "").trim();
  if (!host || host.length > 253 || /[\s\r\n]/.test(host)) throw new Error("Enter a server IP or domain without spaces.");
  const port = Number(input?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be a whole number from 1 to 65535.");
  const version = String(input?.version || "auto").trim();
  if (version.length > 40 || /[\r\n]/.test(version)) throw new Error("Enter a valid Minecraft version or auto.");
  const auth = String(input?.auth || "offline").trim().toLowerCase();
  if (!new Set(["microsoft", "offline"]).has(auth)) throw new Error("Choose Microsoft or Offline / LAN login.");
  const username = String(input?.username || "MinecraftBuddy").trim();
  if (!username || username.length > 80 || /[\r\n]/.test(username)) throw new Error("Enter a valid bot account label.");
  return { host, port, version: version || "auto", auth, username };
}

async function saveSettings(input) {
  const next = validateSettings(input);
  await fs.mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  Object.assign(runtimeSettings, next);
  return { ...runtimeSettings };
}

function validateAISettings(input) {
  const provider = String(input?.provider || aiSettings.provider || "openrouter").trim().toLowerCase();
  const rawBaseUrl = String(input?.baseUrl ?? (PROVIDER_PRESETS[provider]?.baseUrl || aiSettings.baseUrl)).trim();
  let parsed;
  try { parsed = new URL(rawBaseUrl); } catch { throw new Error("Enter a valid OpenAI-compatible API base URL."); }
  const localHost = new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost)) {
    throw new Error("Remote API URLs must use HTTPS. HTTP is allowed only for a local provider such as Ollama.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Put the API key in its own field; the base URL must not contain credentials, query text, or a fragment.");
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  let model = String(input?.model ?? aiSettings.model).trim().replace(/\s+/g, "-");
  if (provider === "gemini" && (/3\.8|38|gemini-3/i.test(model) || !model.startsWith("gemini-"))) {
    model = "gemini-2.0-flash";
  }
  if (!model || model.length > 160 || /[\r\n]/.test(model)) throw new Error("Enter a valid model name.");
  const autoReply = Boolean(input?.autoReply ?? aiSettings.autoReply);
  const trigger = String(input?.trigger ?? aiSettings.trigger).trim();
  if (!/^[@!#][A-Za-z0-9_-]{1,20}$/.test(trigger)) throw new Error("The in-game trigger must start with @, !, or # and use 2–21 letters, numbers, _ or -.");
  return { provider, baseUrl, model, autoReply, trigger };
}

async function persistAISettings(next) {
  await fs.mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await fs.writeFile(aiSettingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  Object.assign(aiSettings, next);
}

function aiStatus() {
  return {
    connected: aiConnected,
    hasKey: aiApiKeys.length > 0,
    keysCount: aiApiKeys.length,
    activeKeyIndex: activeKeyIndex,
    provider: aiSettings.provider || "openrouter",
    baseUrl: aiSettings.baseUrl,
    model: aiSettings.model,
    autoReply: aiSettings.autoReply,
    trigger: aiSettings.trigger,
    lastError: aiLastError,
    presets: PROVIDER_PRESETS
  };
}

async function requestAI(messages, config = aiSettings, keys = aiApiKeys) {
  if (!keys || keys.length === 0) {
    throw new Error("Enter at least one API key and connect an AI provider first.");
  }

  let lastErr = null;
  const totalKeys = keys.length;

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const idx = (activeKeyIndex + attempt) % totalKeys;
    const currentKey = keys[idx];

    try {
      const requestHeaders = {
        Authorization: `Bearer ${currentKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/minecraft-ai-buddy",
        "X-Title": "Minecraft AI Buddy"
      };
      if (config.provider === "gemini") {
        requestHeaders["api-key"] = currentKey;
        requestHeaders["x-goog-api-key"] = currentKey;
      }

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: 220,
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(30_000)
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errObj = Array.isArray(payload) ? payload[0]?.error : payload?.error;
        const errorMsg = String(errObj?.message || payload?.message || `HTTP ${response.status}`);
        const isRateLimitOrQuota = response.status === 429 || response.status === 402 || response.status === 401 ||
          /rate limit|quota|credits|exceeded|too many requests|unauthorized/i.test(errorMsg);

        if (isRateLimitOrQuota && totalKeys > 1) {
          console.error(`[AIBuddy AI] Key #${idx + 1}/${totalKeys} hit limit/quota (${errorMsg}). Switching to next key...`);
          lastErr = new Error(`Key #${idx + 1}: ${errorMsg}`);
          activeKeyIndex = (idx + 1) % totalKeys;
          continue;
        }

        throw new Error(`AI Provider error (HTTP ${response.status}): ${errorMsg}`);
      }

      activeKeyIndex = idx;
      const content = payload?.choices?.[0]?.message?.content;
      const answer = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => p?.text || "").join(" ") : "";
      if (!answer.trim()) throw new Error("The AI provider returned an empty response.");
      return answer.trim();
    } catch (err) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        lastErr = new Error("AI request timed out.");
      } else {
        lastErr = err;
      }
      if (totalKeys > 1 && attempt < totalKeys - 1) {
        console.error(`[AIBuddy AI] Key #${idx + 1} failed: ${err.message}. Rotating key in stack...`);
        activeKeyIndex = (idx + 1) % totalKeys;
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error("All API keys in the stack failed.");
}

async function connectAI(input) {
  let next = validateAISettings(input);
  const raw = String(input?.apiKey || input?.apiKeys || "").trim();
  const keys = raw
    .split(/[\r\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 5);

  if (keys.length === 0) {
    throw new Error("Paste at least one valid API key.");
  }

  const firstKey = keys[0];

  // Smart Auto-Detection: Match provider and models automatically with key format
  if (firstKey.startsWith("gsk_")) {
    next.provider = "groq";
    next.baseUrl = PROVIDER_PRESETS.groq.baseUrl;
    next.model = PROVIDER_PRESETS.groq.models[0].id;
  } else if (firstKey.startsWith("AIzaSy")) {
    next.provider = "gemini";
    next.baseUrl = PROVIDER_PRESETS.gemini.baseUrl;
    next.model = PROVIDER_PRESETS.gemini.models[0].id;
  } else if (firstKey.startsWith("sk-or-")) {
    next.provider = "openrouter";
    next.baseUrl = PROVIDER_PRESETS.openrouter.baseUrl;
    next.model = PROVIDER_PRESETS.openrouter.models[0].id;
  } else if (firstKey.startsWith("sk-proj-") || (firstKey.startsWith("sk-") && !firstKey.startsWith("sk-or-"))) {
    next.provider = "openai";
    next.baseUrl = PROVIDER_PRESETS.openai.baseUrl;
    next.model = PROVIDER_PRESETS.openai.models[0].id;
  } else {
    throw new Error(
      "Aapki API key kisi standard AI provider se match nahi hui. " +
      "Groq ki key 'gsk_...' se shuru hoti hai (console.groq.com/keys) aur " +
      "Gemini ki key 'AIzaSy...' se shuru hoti hai (aistudio.google.com). " +
      "Kripya console se sahi API key copy karke paste karein."
    );
  }

  await requestAI([{ role: "user", content: "Reply with READY." }], next, keys);
  await persistAISettings(next);
  aiApiKeys = keys;
  activeKeyIndex = 0;
  aiConnected = true;
  aiLastError = null;
  dashboard?.emit("state", dashboardState({ viewerPort: VIEWER_PORT }));
  return aiStatus();
}

async function saveAIOptions(input) {
  const next = validateAISettings(input);
  const providerChanged = next.baseUrl !== aiSettings.baseUrl || next.model !== aiSettings.model;
  await persistAISettings(next);
  if (providerChanged && !input?.apiKey && !input?.apiKeys) {
    aiApiKeys = [];
    aiConnected = false;
    aiLastError = null;
  }
  dashboard?.emit("state", dashboardState({ viewerPort: VIEWER_PORT }));
  return aiStatus();
}

function disconnectAI() {
  aiApiKeys = [];
  activeKeyIndex = 0;
  aiConnected = false;
  aiLastError = null;
  dashboard?.emit("state", dashboardState({ viewerPort: VIEWER_PORT }));
  return aiStatus();
}

let autoReconnectTimer = null;
let autonomousLoopTimer = null;
let deliberateDisconnect = false;

async function executeAIAction(action, target, username) {
  if (!bot?.entity || !action || action === "none") return;

  try {
    if (action === "command") {
      const cmd = String(target || "").trim();
      if (cmd.startsWith("/")) bot.chat(cmd);
      return;
    }

    if (action === "follow") {
      const targetName = target || username;
      const playerEntity = Object.values(bot.players).find((p) => p.username?.toLowerCase() === targetName.toLowerCase())?.entity;
      if (playerEntity) {
        bot.lookAt(playerEntity.position.offset(0, 1.6, 0), true);
        bot.pathfinder?.setGoal(new GoalFollow(playerEntity, 2), true);
      }
      return;
    }

    if (action === "stop") {
      bot.pathfinder?.setGoal(null);
      bot.clearControlStates();
      return;
    }

    if (action === "jump") {
      bot.setControlState("jump", true);
      setTimeout(() => bot?.setControlState("jump", false), 400);
      return;
    }

    if (action === "crouch") {
      bot.setControlState("sneak", true);
      setTimeout(() => {
        bot?.setControlState("sneak", false);
        setTimeout(() => {
          bot?.setControlState("sneak", true);
          setTimeout(() => bot?.setControlState("sneak", false), 250);
        }, 200);
      }, 250);
      return;
    }

    if (action === "mine") {
      const targetBlock = bot.findBlock({
        matching: (blk) => blk && (blk.name.includes("log") || blk.name.includes("wood") || blk.name.includes("dirt") || blk.name.includes("stone") || blk.name.includes("ore")),
        maxDistance: 16
      });
      if (targetBlock) {
        try {
          await goto(new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2), 15000);
          await bot.dig(targetBlock);
        } catch {}
      }
      return;
    }

    if (action === "drop") {
      const item = bot.inventory.items()[0];
      if (item) await bot.tossStack(item);
      return;
    }

    if (action === "attack") {
      const hostile = Object.values(bot.entities).find(
        (e) => e && e.type === "mob" && bot.entity.position.distanceTo(e.position) <= 5
      );
      if (hostile) {
        const weapon = bot.inventory.items().find((i) => i.name.includes("sword") || i.name.includes("axe"));
        if (weapon) await bot.equip(weapon, "hand");
        bot.attack(hostile);
      }
      return;
    }
  } catch (err) {
    console.error(`[AIBuddy Action Error]: ${err.message}`);
  }
}

async function generateAIPlayerResponse(username, raw) {
  if (aiReplyInProgress || !bot?.entity) return;
  const now = Date.now();
  if (now - lastAIReplyStartedAt < 2000) return;
  lastAIReplyStartedAt = now;
  aiReplyInProgress = true;

  try {
    const pos = bot.entity.position;
    const pList = Object.entries(bot.players)
      .filter(([name, p]) => name !== bot.username && p.entity)
      .map(([name, p]) => `${name} at X=${Math.round(p.entity.position.x)}, Y=${Math.round(p.entity.position.y)}, Z=${Math.round(p.entity.position.z)} (dist: ${Math.round(pos.distanceTo(p.entity.position))} blocks)`)
      .join("; ");

    const hostiles = Object.values(bot.entities)
      .filter((e) => e && e.type === "mob" && pos.distanceTo(e.position) <= 16)
      .slice(0, 5)
      .map((e) => `${e.name || e.type} (dist: ${Math.round(pos.distanceTo(e.position))})`)
      .join(", ");

    const items = bot.inventory.items().slice(0, 10).map((i) => `${i.name}x${i.count}`).join(", ") || "empty";

    const prompt = `You are AIBuddy, a smart, friendly, real human Minecraft player playing on the server with friends ${username} and others.
You talk in friendly, natural Hindi / Hinglish. Keep messages short (under 90 chars).
You have OP permissions on the server. If a player asks to fix/change something (like time, weather, gamemode, help), you can run OP commands fairly.
You can execute game actions by returning a JSON object:
{
  "chat": "Your friendly Hindi/Hinglish message to player",
  "action": "none" | "follow" | "stop" | "mine" | "attack" | "drop" | "jump" | "crouch" | "command",
  "target": "target string (e.g. player name, block type, or slash command like '/time set day')"
}

Examples:
- Player: "aao mere paas" -> {"chat": "Aa raha hoon ${username} bhai! 🏃", "action": "follow", "target": "${username}"}
- Player: "din kar do" -> {"chat": "Din kar diya bhai! ☀️", "action": "command", "target": "/time set day"}
- Player: "raat kar do" -> {"chat": "Raat kar di bhai! 🌙", "action": "command", "target": "/time set night"}
- Player: "weather clear" -> {"chat": "Mausam saaf kar diya! ⛅", "action": "command", "target": "/weather clear"}
- Player: "lakdi todo" -> {"chat": "Main lakdi todne ja raha hoon! ⛏️", "action": "mine", "target": "wood"}
- Player: "samaan do" -> {"chat": "Ye lo samaan! 🎁", "action": "drop", "target": ""}
- Player: "ruko" -> {"chat": "Ruk gaya bhai! 👍", "action": "stop", "target": ""}
- Player: "namaste / kaisa hai" -> {"chat": "Namaste bhai! Ekdum mast hoon! 🙏", "action": "crouch", "target": ""}

In-Game Status:
- Your Pos: X=${Math.round(pos.x)}, Y=${Math.round(pos.y)}, Z=${Math.round(pos.z)} (Dim: ${bot.game?.dimension || "overworld"})
- Health: ${Math.round(bot.health)}/20, Food: ${Math.round(bot.food)}/20
- Nearby Players: ${pList || "none"}
- Nearby Hostile Mobs: ${hostiles || "none"}
- Inventory: ${items}`;

    const rawAI = await requestAI([
      { role: "system", content: prompt },
      { role: "user", content: `${username}: "${raw}"` }
    ]);

    let parsed = null;
    try {
      const jsonMatch = rawAI.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {}

    if (parsed && parsed.chat) {
      bot.chat(parsed.chat);
      await executeAIAction(parsed.action, parsed.target, username);
    } else {
      const clean = rawAI.replace(/[\r\n]+/g, " ").trim().slice(0, 100);
      if (clean) bot.chat(clean);
    }
  } finally {
    aiReplyInProgress = false;
  }
}

async function handleRuleBasedPlayerChat(username, raw) {
  const lower = raw.toLowerCase();

  // 1. OP & World Management Commands
  if (lower.includes("day karo") || lower.includes("subah karo") || lower.includes("din karo") || lower.includes("time day") || lower.includes("din kar")) {
    bot.chat("/time set day");
    bot.chat(`Day time kar diya ${username} bhai! ☀️`);
    return;
  }
  if (lower.includes("night karo") || lower.includes("raat karo") || lower.includes("time night") || lower.includes("raat kar")) {
    bot.chat("/time set night");
    bot.chat(`Raat kar di ${username} bhai! 🌙`);
    return;
  }
  if (lower.includes("weather") || lower.includes("mausam saaf") || lower.includes("barish rok")) {
    bot.chat("/weather clear");
    bot.chat(`Mausam ekdum saaf kar diya! ⛅`);
    return;
  }
  if (lower.includes("creative") || lower.includes("gm 1") || lower.includes("gamemode 1")) {
    bot.chat(`/gamemode creative ${bot.username}`);
    bot.chat(`Main Creative mode me aa gaya hoon! 🛠️`);
    return;
  }
  if (lower.includes("survival") || lower.includes("gm 0") || lower.includes("gamemode 0")) {
    bot.chat(`/gamemode survival ${bot.username}`);
    bot.chat(`Survival mode me aa gaya hoon! ⚔️`);
    return;
  }

  // 2. Movement & Following
  if (lower.includes("aao") || lower.includes("aaja") || lower.includes("follow") || lower.includes("mere paas") || lower.includes("idhar aao") || lower.includes("come")) {
    const playerEntity = Object.values(bot.players).find((p) => p.username?.toLowerCase() === username.toLowerCase())?.entity;
    if (playerEntity) {
      bot.lookAt(playerEntity.position.offset(0, 1.6, 0), true);
      bot.pathfinder?.setGoal(new GoalFollow(playerEntity, 2), true);
      bot.chat(`Haan ${username} bhai, aa raha hoon tumhare peechhe! 🏃`);
    } else {
      bot.chat(`${username} bhai, tum thoda door ho ya dikh nahi rahe, thoda paas aao!`);
    }
    return;
  }

  if (lower.includes("ruko") || lower.includes("stop") || lower.includes("wait") || lower.includes("thahar") || lower.includes("khade raho")) {
    bot.pathfinder?.setGoal(null);
    bot.clearControlStates();
    bot.chat(`Ruk gaya ${username} bhai! 👍`);
    return;
  }

  // 3. Fun Interactions: Jump & Sneak
  if (lower.includes("jump") || lower.includes("koodo") || lower.includes("chalang")) {
    bot.setControlState("jump", true);
    setTimeout(() => bot?.setControlState("jump", false), 400);
    bot.chat("Boing! Ye lo jump! 🦘");
    return;
  }

  if (lower.includes("sneak") || lower.includes("crouch") || lower.includes("baitho") || lower.includes("twerk") || lower.includes("namaste")) {
    bot.setControlState("sneak", true);
    setTimeout(() => {
      bot?.setControlState("sneak", false);
      setTimeout(() => {
        bot?.setControlState("sneak", true);
        setTimeout(() => bot?.setControlState("sneak", false), 250);
      }, 250);
    }, 250);
    bot.chat(`Namaste ${username} bhai! 🙏`);
    return;
  }

  // 4. Position & Status
  if (lower.includes("kahan") || lower.includes("coords") || lower.includes("pos") || lower.includes("location") || lower.includes("coordinates")) {
    const p = bot.entity.position;
    bot.chat(`Main yahan hoon: X=${Math.round(p.x)}, Y=${Math.round(p.y)}, Z=${Math.round(p.z)}`);
    return;
  }

  if (lower.includes("health") || lower.includes("food") || lower.includes("khana") || lower.includes("hp") || lower.includes("status")) {
    bot.chat(`Meri Health: ${Math.round(bot.health)}/20 aur Food: ${Math.round(bot.food)}/20 hai!`);
    return;
  }

  // 5. Mining & Wood gathering
  if (lower.includes("wood") || lower.includes("lakdi") || lower.includes("mine") || lower.includes("todo") || lower.includes("dig") || lower.includes("chop")) {
    const targetBlock = bot.findBlock({
      matching: (blk) => blk && (blk.name.includes("log") || blk.name.includes("wood") || blk.name.includes("dirt") || blk.name.includes("stone")),
      maxDistance: 16
    });
    if (targetBlock) {
      bot.chat(`Main ${targetBlock.name} todne ja raha hoon! ⛏️`);
      try {
        await goto(new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2), 15000);
        await bot.dig(targetBlock);
        bot.chat(`${targetBlock.name} tod diya bhai!`);
      } catch (e) {
        bot.chat(`Block todne me dikkat: ${e.message}`);
      }
    } else {
      bot.chat("Aas-paas koi lakdi ya stone nahi mila bhai!");
    }
    return;
  }

  // 6. Drop items
  if (lower.includes("drop") || lower.includes("samaan") || lower.includes("item") || lower.includes("phenko")) {
    const item = bot.inventory.items()[0];
    if (item) {
      await bot.tossStack(item);
      bot.chat(`Ye lo ${item.name}! 🎁`);
    } else {
      bot.chat("Meri inventory abhi khali hai bhai!");
    }
    return;
  }

  // 7. Natural friendly Hinglish responses
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("oye") || lower.includes("hey")) {
    const replies = [
      `Haan ${username} bhai! Kaise ho?`,
      `Hello ${username}! Kya plan hai aaj?`,
      `Hi ${username} bhai! Batao kya karein?`
    ];
    bot.chat(replies[Math.floor(Math.random() * replies.length)]);
    return;
  }

  if (lower.includes("kaisa hai") || lower.includes("kaise ho") || lower.includes("kya hal") || lower.includes("sab theek")) {
    bot.chat("Ekdum badhiya bhai! Server me khelne ke liye ready hoon!");
    return;
  }

  if (lower.includes("khelo") || lower.includes("khelte") || lower.includes("chal") || lower.includes("play")) {
    bot.chat(`Haan ${username} bhai, chalo khelte hain! Mujhe follow karne ko bolo ya koi command do! 🎮`);
    return;
  }

  if (lower.includes("op") || lower.includes("server")) {
    bot.chat(`OP de do bhai mujhe (/op ${bot.username}), phir server ko mast build aur manage karenge! ✨`);
    return;
  }

  // Default friendly acknowledgement
  const generalReplies = [
    `Haan ${username} bhai, sun raha hoon!`,
    `Sahi baat hai ${username} bhai!`,
    `Aap bas bolo kya karna hai - Mining, Building ya Exploring?`
  ];
  bot.chat(generalReplies[Math.floor(Math.random() * generalReplies.length)]);
}

async function handlePlayerChat(username, message) {
  if (!bot?.entity || username === bot.username) return;
  const raw = String(message).trim();
  if (!raw) return;

  console.error(`[AIBuddy] Player ${username} said: "${raw}"`);

  // 1. Direct slash command requested
  if (raw.startsWith("/")) {
    bot.chat(raw);
    return;
  }

  // 2. AI Intelligence (Normal Player Behavior + OP Management)
  if (aiConnected && aiApiKeys.length > 0 && aiSettings.autoReply) {
    try {
      await generateAIPlayerResponse(username, raw);
      return;
    } catch (err) {
      console.error(`[AIBuddy] AI response error: ${err.message}. Falling back to rule-based logic.`);
    }
  }

  // 3. Fallback to Rule-based Player Actions
  await handleRuleBasedPlayerChat(username, raw);
}

function startAutonomousLoop(currentBot) {
  if (autonomousLoopTimer) clearInterval(autonomousLoopTimer);
  autonomousLoopTimer = setInterval(() => {
    if (!currentBot?.entity || botState !== "connected") return;

    // 1. Look towards the nearest player if nearby
    const nearestPlayer = Object.values(currentBot.players).find(
      (p) => p.username !== currentBot.username && p.entity && currentBot.entity.position.distanceTo(p.entity.position) <= 12
    )?.entity;

    if (nearestPlayer && !currentBot.pathfinder?.isMoving()) {
      try {
        currentBot.lookAt(nearestPlayer.position.offset(0, 1.6, 0), true);
      } catch {}
    }

    // 2. Defense: If a hostile mob is very close (within 3.5 blocks), attack it!
    const hostileMob = Object.values(currentBot.entities).find(
      (e) =>
        e &&
        e.type === "mob" &&
        ["zombie", "skeleton", "spider", "creeper", "enderman", "witch", "phantom", "drowned"].some((m) => e.name?.toLowerCase().includes(m)) &&
        currentBot.entity.position.distanceTo(e.position) <= 3.5
    );
    if (hostileMob) {
      try {
        const weapon = currentBot.inventory.items().find((i) => i.name.includes("sword") || i.name.includes("axe"));
        if (weapon) currentBot.equip(weapon, "hand");
        currentBot.attack(hostileMob);
      } catch {}
    }
  }, 2000);
}

function scheduleReconnect() {
  if (deliberateDisconnect) return;
  if (autoReconnectTimer) clearTimeout(autoReconnectTimer);
  autoReconnectTimer = setTimeout(async () => {
    if (deliberateDisconnect || botState === "connected" || botState === "connecting") return;
    console.error("[AIBuddy] Auto-reconnecting to server in 4s...");
    try {
      await connectBot();
      console.error("[AIBuddy] Auto-reconnected successfully!");
    } catch (e) {
      console.error(`[AIBuddy] Auto-reconnect failed: ${e.message}, will retry...`);
      scheduleReconnect();
    }
  }, 4000);
}

function connectionSummary() {
  if (!bot?.entity) return { state: botState, lastError };
  const p = bot.entity.position;
  return {
    state: "connected",
    username: bot.username,
    position: { x: round(p.x), y: round(p.y), z: round(p.z) },
    health: bot.health,
    food: bot.food,
    yaw: bot.entity.yaw,
    pitch: bot.entity.pitch,
    dimension: bot.game?.dimension ?? "unknown"
  };
}

function dashboardState({ viewerPort }) {
  const summary = connectionSummary();
  const inventory = bot?.entity ? bot.inventory.items().map((item) => ({ name: item.name, count: item.count })) : [];
  const hotbar = [];
  if (bot?.entity) {
    for (let i = 0; i < 9; i++) {
      const item = bot.inventory.slots[36 + i];
      hotbar.push(item ? { slot: i, name: item.name, count: item.count } : { slot: i, name: null, count: 0 });
    }
  }
  const activeSlot = bot?.quickBarSlot ?? 0;
  return {
    bot: {
      ...summary,
      inventory,
      hotbar,
      activeSlot,
      heldItem: hotbar[activeSlot]?.name || null
    },
    chat: recentChat.slice(-40),
    settings: { ...runtimeSettings },
    ai: aiStatus(),
    viewerAvailable: Boolean(bot?.entity),
    viewerUrl: "/viewer/"
  };
}

let activeViewer = null;

function closeViewer() {
  if (activeViewer) {
    try { activeViewer.close?.(); } catch {}
    activeViewer = null;
  }
  viewerActive = false;
}

function startViewer(candidate) {
  if (candidate.viewer) {
    activeViewer = candidate.viewer;
    viewerActive = true;
    return;
  }
  closeViewer();
  try {
    mineflayerViewer(candidate, { port: VIEWER_PORT, firstPerson: true, viewDistance: 4 });
    activeViewer = candidate.viewer;
    viewerActive = true;
    console.error(`[minecraft-ai-buddy] 3D POV viewer active on port ${VIEWER_PORT}`);
  } catch (error) {
    console.error(`[minecraft-ai-buddy] Viewer startup error: ${error.message}`);
    viewerActive = false;
  }
}

async function executeTool(name, args) {
  const action = toolActions.get(name);
  if (!action) throw new Error("That control is not available.");
  return action(args);
}

function round(number) {
  return Math.round(number * 100) / 100;
}

function requireBot() {
  if (!bot?.entity || botState !== "connected") {
    throw new Error("The bot is not connected yet. Call minecraft_connect first.");
  }
  return bot;
}

function safePosition(entity) {
  if (!entity?.position) return null;
  return { x: round(entity.position.x), y: round(entity.position.y), z: round(entity.position.z) };
}

function distance(a, b) {
  return a.position.distanceTo(b.position);
}

async function connectBot() {
  if (bot?.entity && botState === "connected") return connectionSummary();
  if (connectPromise) return connectPromise;

  const settings = validateSettings(runtimeSettings);
  const { host, auth, port: rawPort, version } = settings;
  const options = {
    host,
    port: rawPort,
    username: settings.username,
    auth,
    hideErrors: true
  };
  if (version && version.toLowerCase() !== "auto") {
    options.version = version;
  } else if (host.includes("phantomhorizon549") || host.includes("mcsh.io")) {
    options.version = "1.21.1";
  }

  deliberateDisconnect = false;
  botState = "connecting";
  lastError = null;

  connectPromise = new Promise((resolve, reject) => {
    let candidate;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Timed out waiting for the bot to join. Check the server address, version, login, and firewall.")), 120_000);

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result);
    };

    try {
      candidate = mineflayer.createBot(options);
      bot = candidate;

      candidate.loadPlugin(pathfinder);

      candidate.on("spawn", () => {
        candidate.pathfinder.setMovements(new Movements(candidate));
        botState = "connected";
        lastError = null;
        startViewer(candidate);
        startAutonomousLoop(candidate);
        if (!settled) finish(null, connectionSummary());
      });

      candidate.on("death", () => {
        console.error("[AIBuddy] Bot died! Auto-respawning in 1s...");
        setTimeout(() => {
          try {
            candidate.respawn();
            console.error("[AIBuddy] Bot respawned successfully!");
          } catch (e) {
            console.error(`[AIBuddy] Respawn error: ${e.message}`);
          }
        }, 1000);
      });

      candidate.on("chat", (username, message) => {
        if (username === candidate.username) return;
        const chatItem = { username, message: String(message).slice(0, 300), at: new Date().toISOString(), direction: "in" };
        recentChat.push(chatItem);
        if (recentChat.length > 40) recentChat.shift();
        dashboard?.emit("game-chat", chatItem);
        void handlePlayerChat(username, chatItem.message);
      });

      candidate.on("kicked", (reason) => {
        lastError = typeof reason === "string" ? reason : JSON.stringify(reason);
        console.error(`[AIBuddy] Kicked from server: ${lastError}`);
        if (!settled) finish(new Error(`Server rejected the bot: ${lastError}`));
      });

      candidate.on("error", (error) => {
        lastError = error?.message || String(error);
        console.error(`[minecraft-ai-buddy] ${lastError}`);
        if (!settled) finish(new Error(lastError));
      });

      candidate.once("end", (reason) => {
        if (autonomousLoopTimer) clearInterval(autonomousLoopTimer);
        closeViewer();
        if (bot === candidate) bot = null;
        botState = "disconnected";
        if (reason) lastError = String(reason);
        console.error(`[AIBuddy] Bot disconnected: ${reason || "ended"}`);
        if (!settled) finish(new Error(`Connection ended before the bot joined${reason ? `: ${reason}` : "."}`));
        dashboard?.emit("state", dashboardState({ viewerPort: VIEWER_PORT }));
        if (!deliberateDisconnect) {
          scheduleReconnect();
        }
        deliberateDisconnect = false;
      });
    } catch (error) {
      if (candidate && bot === candidate) bot = null;
      botState = "error";
      lastError = error instanceof Error ? error.message : String(error);
      finish(error instanceof Error ? error : new Error(lastError));
    }
  });

  try {
    return await connectPromise;
  } catch (error) {
    botState = "error";
    lastError = error instanceof Error ? error.message : String(error);
    if (bot) {
      const failedBot = bot;
      bot = null;
      try { failedBot.quit(); } catch { /* The connection may already be closed. */ }
    }
    throw error;
  } finally {
    connectPromise = null;
  }
}

function boundedCoordinates(x, y, zValue) {
  for (const [label, value] of [["x", x], ["y", y], ["z", zValue]]) {
    if (!Number.isInteger(value) || Math.abs(value) > MAX_COORD) {
      throw new Error(`${label} must be a whole Minecraft block coordinate within the world bounds.`);
    }
  }
}

async function goto(goal, timeoutMs = 45_000) {
  const currentBot = requireBot();
  const movePromise = currentBot.pathfinder.goto(goal);
  movePromise.catch(() => {});
  let timer;
  try {
    await Promise.race([
      movePromise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Move timed out; the path may be blocked.")), timeoutMs); })
    ]);
    return connectionSummary();
  } catch (error) {
    currentBot.pathfinder.setGoal(null);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

register(
  "minecraft_connect",
  "Connect the Minecraft Java bot using the server settings saved in the local dashboard. Microsoft login may ask you to complete a device-code sign-in on first use.",
  {},
  async () => connectBot()
);

register(
  "minecraft_status",
  "Read the bot's position, health, hunger, dimension, inventory, nearby players, and nearby entities.",
  {},
  async () => {
    const currentBot = requireBot();
    const nearbyEntities = Object.values(currentBot.entities)
      .filter((entity) => entity !== currentBot.entity && entity.position && distance(entity, currentBot.entity) <= 16)
      .slice(0, 20)
      .map((entity) => ({ name: entity.username || entity.name || entity.type, type: entity.type, position: safePosition(entity) }));
    const players = Object.entries(currentBot.players)
      .filter(([name, player]) => name !== currentBot.username && player.entity)
      .map(([name, player]) => ({ name, position: safePosition(player.entity) }));

    return {
      ...connectionSummary(),
      inventory: currentBot.inventory.items().map((item) => ({ name: item.name, count: item.count })),
      nearbyPlayers: players,
      nearbyEntities
    };
  }
);

register(
  "minecraft_recent_chat",
  "Read up to the latest 20 player chat messages received by the bot.",
  { limit: z.number().int().min(1).max(20).default(10) },
  async ({ limit }) => recentChat.slice(-limit)
);

register(
  "minecraft_chat",
  "Send an in-game chat message or slash command as the bot.",
  { message: z.string().min(1).max(240) },
  async ({ message }) => {
    const currentBot = requireBot();
    const clean = message.replace(/[\r\n]/g, " ").trim();
    if (!clean) throw new Error("Chat message cannot be blank.");
    currentBot.chat(clean);
    const chatItem = { username: currentBot.username, message: clean, at: new Date().toISOString(), direction: "out" };
    recentChat.push(chatItem);
    if (recentChat.length > 40) recentChat.shift();
    dashboard?.emit("game-chat", chatItem);
    return { sent: clean };
  }
);

register(
  "minecraft_move_to",
  "Walk to a nearby set of Minecraft coordinates using pathfinding. Movement is limited to a 128-block straight-line distance per call.",
  {
    x: z.number().int().min(-MAX_COORD).max(MAX_COORD),
    y: z.number().int().min(-2048).max(2048),
    z: z.number().int().min(-MAX_COORD).max(MAX_COORD)
  },
  async ({ x, y, z: zValue }) => {
    boundedCoordinates(x, y, zValue);
    const currentBot = requireBot();
    const target = new Vec3(x, y, zValue);
    if (currentBot.entity.position.distanceTo(target) > 128) {
      throw new Error("That target is more than 128 blocks away. Move in shorter steps.");
    }
    return goto(new GoalNear(x, y, zValue, 1));
  }
);

register(
  "minecraft_follow_player",
  "Follow a visible player by name until minecraft_stop is called or a new movement goal replaces it.",
  { player_name: z.string().min(1).max(32) },
  async ({ player_name }) => {
    const currentBot = requireBot();
    const match = Object.entries(currentBot.players).find(([name, player]) => name.toLowerCase() === player_name.toLowerCase() && player.entity);
    if (!match) throw new Error(`Player ${player_name} is not visible nearby.`);
    currentBot.pathfinder.setGoal(new GoalFollow(match[1].entity, 2), true);
    return { following: match[0], position: safePosition(match[1].entity) };
  }
);

register(
  "minecraft_look_at",
  "Turn the bot to face the given Minecraft coordinates.",
  {
    x: z.number().min(-MAX_COORD).max(MAX_COORD),
    y: z.number().min(-2048).max(2048),
    z: z.number().min(-MAX_COORD).max(MAX_COORD)
  },
  async ({ x, y, z: zValue }) => {
    const currentBot = requireBot();
    await currentBot.lookAt(new Vec3(x, y, zValue), true);
    return { lookingAt: { x, y, z: zValue } };
  }
);

register(
  "minecraft_look",
  "Set the bot's viewing direction. Yaw and pitch are in radians.",
  { yaw: z.number().min(-100).max(100), pitch: z.number().min(-1.55).max(1.55) },
  async ({ yaw, pitch }) => {
    const currentBot = requireBot();
    try {
      if (typeof currentBot.look === "function") {
        currentBot.look(yaw, pitch, true).catch(() => {});
      }
    } catch {}
    return { yaw: currentBot.entity?.yaw ?? yaw, pitch: currentBot.entity?.pitch ?? pitch };
  }
);

register(
  "minecraft_press_control",
  "Press or release one movement control for the bot.",
  { control: z.enum(["forward", "back", "left", "right", "jump", "sprint", "sneak"]), pressed: z.boolean() },
  async ({ control, pressed }) => {
    const currentBot = requireBot();
    try {
      if (pressed && currentBot.pathfinder) {
        currentBot.pathfinder.setGoal(null);
      }
      currentBot.setControlState(control, Boolean(pressed));
    } catch (e) {
      console.error(`[minecraft_press_control] error: ${e.message}`);
    }
    return { control, pressed };
  }
);

register(
  "minecraft_use_item",
  "Use the item in the bot's hand briefly.",
  {},
  async () => {
    const currentBot = requireBot();
    currentBot.activateItem();
    const release = setTimeout(() => {
      if (bot === currentBot) currentBot.deactivateItem();
    }, 350);
    release.unref?.();
    return { used: true };
  }
);

register(
  "minecraft_inspect_block",
  "Inspect the block at exact coordinates in the bot's loaded world.",
  {
    x: z.number().int().min(-MAX_COORD).max(MAX_COORD),
    y: z.number().int().min(-2048).max(2048),
    z: z.number().int().min(-MAX_COORD).max(MAX_COORD)
  },
  async ({ x, y, z: zValue }) => {
    const currentBot = requireBot();
    const block = currentBot.blockAt(new Vec3(x, y, zValue));
    if (!block) return { loaded: false, position: { x, y, z: zValue } };
    return {
      loaded: true,
      name: block.name,
      type: block.type,
      position: { x: block.position.x, y: block.position.y, z: block.position.z },
      boundingBox: block.boundingBox,
      harvestable: currentBot.canDigBlock(block)
    };
  }
);

register(
  "minecraft_search_blocks",
  "Find nearby loaded blocks whose Minecraft block name contains the requested text.",
  {
    name_contains: z.string().min(1).max(40),
    radius: z.number().int().min(2).max(32).default(16),
    limit: z.number().int().min(1).max(25).default(10)
  },
  async ({ name_contains, radius, limit }) => {
    const currentBot = requireBot();
    const query = name_contains.toLowerCase();
    const positions = currentBot.findBlocks({
      matching: (block) => block.name.toLowerCase().includes(query),
      maxDistance: radius,
      count: limit
    });
    return positions.map((position) => {
      const block = currentBot.blockAt(position);
      return { name: block?.name ?? "unknown", position: { x: position.x, y: position.y, z: position.z } };
    });
  }
);

register(
  "minecraft_mine_block",
  "Break one block at the given coordinates. Only blocks within five blocks of the bot can be mined.",
  {
    x: z.number().int().min(-MAX_COORD).max(MAX_COORD),
    y: z.number().int().min(-2048).max(2048),
    z: z.number().int().min(-MAX_COORD).max(MAX_COORD)
  },
  async ({ x, y, z: zValue }) => {
    const currentBot = requireBot();
    const position = new Vec3(x, y, zValue);
    if (currentBot.entity.position.distanceTo(position) > 5) throw new Error("That block is more than five blocks away.");
    const block = currentBot.blockAt(position);
    if (!block || block.name === "air" || block.boundingBox === "empty") throw new Error("There is no solid block to mine there.");
    if (!currentBot.canDigBlock(block)) throw new Error(`The bot cannot mine ${block.name} with its current tool or game mode.`);
    await currentBot.dig(block);
    return { mined: block.name, position: { x, y, z: zValue } };
  }
);

register(
  "minecraft_place_block",
  "Place one item from the bot's inventory at a nearby empty block position. The bot needs a solid adjacent block to place against.",
  {
    item_name: z.string().min(1).max(50),
    x: z.number().int().min(-MAX_COORD).max(MAX_COORD),
    y: z.number().int().min(-2048).max(2048),
    z: z.number().int().min(-MAX_COORD).max(MAX_COORD)
  },
  async ({ item_name, x, y, z: zValue }) => {
    const currentBot = requireBot();
    const target = new Vec3(x, y, zValue);
    if (currentBot.entity.position.distanceTo(target) > 5) throw new Error("That position is more than five blocks away.");
    const targetBlock = currentBot.blockAt(target);
    if (!targetBlock || !(targetBlock.name === "air" || targetBlock.name.endsWith("_air"))) {
      throw new Error("The target position must be loaded and empty.");
    }

    const stack = currentBot.inventory.items().find((item) => item.name.toLowerCase() === item_name.toLowerCase());
    if (!stack) throw new Error(`The bot has no ${item_name} in its inventory.`);

    const faces = [new Vec3(0, 1, 0), new Vec3(0, -1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)];
    for (const face of faces) {
      const reference = currentBot.blockAt(target.minus(face));
      if (reference?.boundingBox !== "block") continue;
      await currentBot.equip(stack, "hand");
      await currentBot.placeBlock(reference, face);
      return { placed: item_name, position: { x, y, z: zValue } };
    }
    throw new Error("No solid neighboring block was available to place against.");
  }
);

register(
  "minecraft_stop",
  "Immediately cancel pathfinding and stop the bot's movement controls.",
  {},
  async () => {
    const currentBot = requireBot();
    currentBot.pathfinder.setGoal(null);
    currentBot.clearControlStates();
    return { stopped: true, position: safePosition(currentBot.entity) };
  }
);

register(
  "minecraft_disconnect",
  "Disconnect the bot from the Minecraft server.",
  {},
  async () => {
    if (!bot) return { state: botState, message: "The bot was already disconnected." };
    deliberateDisconnect = true;
    if (autoReconnectTimer) {
      clearTimeout(autoReconnectTimer);
      autoReconnectTimer = null;
    }
    const currentBot = bot;
    botState = "disconnected";
    bot = null;
    closeViewer();
    currentBot.pathfinder?.setGoal(null);
    try { currentBot.quit("AI companion disconnecting"); } catch { /* The socket may already be closed. */ }
    return { state: "disconnected" };
  }
);

register(
  "minecraft_attack",
  "Swing arm and attack nearest mob or targeted entity.",
  {},
  async () => {
    const currentBot = requireBot();
    currentBot.swingArm("right");
    const entity = currentBot.entityAtCursor(4.5) || Object.values(currentBot.entities).find(
      (e) => e && e !== currentBot.entity && e.position && currentBot.entity.position.distanceTo(e.position) <= 3.5
    );
    if (entity) {
      currentBot.attack(entity);
      return { attacked: entity.name || entity.username || "entity" };
    }
    return { swung: true };
  }
);

register(
  "minecraft_interact_target",
  "Left click (attack/mine) or right click (use item/place block) at cursor.",
  { action: z.enum(["attack", "dig", "use", "place", "click"]) },
  async ({ action }) => {
    const currentBot = requireBot();
    currentBot.swingArm("right");
    if (action === "attack" || action === "click" || action === "dig") {
      const entity = currentBot.entityAtCursor(4.5);
      if (entity) {
        currentBot.attack(entity);
        return { action: "attacked", target: entity.name || entity.username || "entity" };
      }
      const block = currentBot.blockAtCursor(5);
      if (block && currentBot.canDigBlock(block)) {
        try {
          await currentBot.dig(block);
          return { action: "dug", block: block.name };
        } catch (e) {
          return { action: "dig_failed", error: e.message };
        }
      }
      return { action: "swung" };
    }
    if (action === "use" || action === "place") {
      const block = currentBot.blockAtCursor(5);
      const held = currentBot.inventory.slots[36 + (currentBot.quickBarSlot || 0)];
      if (block && held && !held.name.includes("food") && !held.name.includes("potion")) {
        try {
          await currentBot.placeBlock(block, new Vec3(0, 1, 0));
          return { action: "placed", item: held.name };
        } catch {
          currentBot.activateItem();
          return { action: "used" };
        }
      }
      currentBot.activateItem();
      return { action: "used" };
    }
    return { action: "none" };
  }
);

register(
  "minecraft_select_slot",
  "Select a hotbar quickbar slot from 0 to 8.",
  { slot: z.number().int().min(0).max(8) },
  async ({ slot }) => {
    const currentBot = requireBot();
    currentBot.setQuickBarSlot(slot);
    const item = currentBot.inventory.slots[36 + slot];
    return { slot, item: item ? { name: item.name, count: item.count } : null };
  }
);

register(
  "minecraft_drop_held",
  "Drop the currently held item in hand.",
  {},
  async () => {
    const currentBot = requireBot();
    const item = currentBot.inventory.slots[36 + (currentBot.quickBarSlot || 0)];
    if (item) {
      await currentBot.tossStack(item);
      return { dropped: item.name, count: item.count };
    }
    return { dropped: null };
  }
);

dashboard = startDashboard({
  port: GUI_PORT,
  viewerPort: VIEWER_PORT,
  getState: dashboardState,
  executeTool,
  saveSettings,
  connectAI,
  saveAIOptions,
  disconnectAI
});

let shuttingDown = false;
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  try { bot?.quit(reason); } catch { /* The socket may already be closed. */ }
  try { bot?.viewer?.close?.(); } catch { /* The viewer may already be closed. */ }
  viewerActive = false;
  dashboard?.close();
}

process.on("SIGINT", () => { shutdown("Server closing"); process.exit(0); });
process.on("SIGTERM", () => { shutdown("Server closing"); process.exit(0); });

if (!process.env.PORT && !process.env.RENDER) {
  process.stdin.on("end", () => shutdown("MCP client disconnected"));
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    console.error(`[minecraft-ai-buddy] Stdio MCP transport not active: ${err.message}`);
  }
}

console.error(`[minecraft-ai-buddy] Server ready; Web dashboard: http://0.0.0.0:${GUI_PORT}`);

// Auto-connect bot on startup
setTimeout(() => {
  if (runtimeSettings.host && (botState === "disconnected" || !bot)) {
    console.error("[minecraft-ai-buddy] Automatically connecting bot to server on startup...");
    connectBot().catch((err) => {
      console.error(`[minecraft-ai-buddy] Startup connect note: ${err.message}`);
    });
  }
}, 2500);

import "dotenv/config";
import { getDatabase, BlueprintRepo, LandmarkRepo, CredentialRepo } from "./storage/database.js";
import { encryptSecret } from "./storage/crypto.js";
import { startServer } from "./api/server.js";
import { botService } from "./bot/connection.js";
import crypto from "node:crypto";

const GUI_PORT = Number(process.env.PORT || process.env.MC_GUI_PORT || 3080);

// Initialize SQLite database
console.error("[Minecraft Nexus AI] Initializing persistent SQLite database...");
getDatabase();

// Seed initial blueprints if empty
if (BlueprintRepo.getAll().length === 0) {
  BlueprintRepo.upsert({
    id: "shelter-oak",
    name: "Oak Survival Shelter",
    description: "Compact 3x3 survival shelter with roof and entrance",
    dimensions: { x: 3, y: 3, z: 3 },
    totalBlocks: 9,
    requiredMaterials: { oak_planks: 9 },
    blocks: [
      { relX: 0, relY: 0, relZ: 0, blockName: "oak_planks" },
      { relX: 1, relY: 0, relZ: 0, blockName: "oak_planks" },
      { relX: 2, relY: 0, relZ: 0, blockName: "oak_planks" },
      { relX: 0, relY: 1, relZ: 0, blockName: "oak_planks" },
      { relX: 2, relY: 1, relZ: 0, blockName: "oak_planks" },
      { relX: 0, relY: 2, relZ: 0, blockName: "oak_planks" },
      { relX: 1, relY: 2, relZ: 0, blockName: "oak_planks" },
      { relX: 2, relY: 2, relZ: 0, blockName: "oak_planks" },
      { relX: 1, relY: 1, relZ: 1, blockName: "oak_planks" }
    ],
    createdAt: Date.now()
  });
}

// Seed initial landmarks if empty
if (LandmarkRepo.getAll().length === 0) {
  LandmarkRepo.upsert({
    id: "spawn-point",
    name: "World Spawn",
    category: "poi",
    coordinates: { x: 0, y: 64, z: 0 },
    dimension: "overworld",
    description: "Initial server spawn coordinates",
    tags: ["spawn", "start"],
    createdAt: Date.now()
  });
}

// Auto-seed API key from environment if present and database pool is empty
if (CredentialRepo.getAll().length === 0) {
  const envGroq = process.env.GROQ_API_KEY;
  const envOpenRouter = process.env.OPENROUTER_API_KEY;
  const envOpenAI = process.env.OPENAI_API_KEY;
  const envGemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (envGemini) {
    const enc = encryptSecret(envGemini);
    CredentialRepo.upsert({
      id: crypto.randomUUID(),
      label: "Google Gemini (Env Key)",
      provider: "gemini",
      encryptedKey: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      preferredModel: "gemini-2.0-flash",
      enabled: true,
      health: "healthy",
      requestsCount: 0,
      failureCount: 0
    });
  } else if (envGroq) {
    const enc = encryptSecret(envGroq);
    CredentialRepo.upsert({
      id: crypto.randomUUID(),
      label: "Groq (Env Key)",
      provider: "groq",
      encryptedKey: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      baseUrl: "https://api.groq.com/openai/v1",
      preferredModel: "llama-3.3-70b-versatile",
      enabled: true,
      health: "healthy",
      requestsCount: 0,
      failureCount: 0
    });
  } else if (envOpenRouter) {
    const enc = encryptSecret(envOpenRouter);
    CredentialRepo.upsert({
      id: crypto.randomUUID(),
      label: "OpenRouter (Env Key)",
      provider: "openrouter",
      encryptedKey: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      baseUrl: "https://openrouter.ai/api/v1",
      preferredModel: "deepseek/deepseek-chat",
      enabled: true,
      health: "healthy",
      requestsCount: 0,
      failureCount: 0
    });
  } else if (envOpenAI) {
    const enc = encryptSecret(envOpenAI);
    CredentialRepo.upsert({
      id: crypto.randomUUID(),
      label: "OpenAI (Env Key)",
      provider: "openai",
      encryptedKey: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      baseUrl: "https://api.openai.com/v1",
      preferredModel: "gpt-4o-mini",
      enabled: true,
      health: "healthy",
      requestsCount: 0,
      failureCount: 0
    });
  }
}

// Start Web Server
startServer(GUI_PORT);

// Auto-connect bot on startup if server address is configured
setTimeout(() => {
  const config = botService.getConfig();
  if (config.host) {
    console.error(`[Minecraft Nexus AI] Automatically connecting to ${config.host}:${config.port}...`);
    botService.connect().catch((err) => {
      console.error(`[Minecraft Nexus AI] Startup connect note: ${err.message}`);
    });
  }
}, 3000);

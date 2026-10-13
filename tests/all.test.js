import { test, describe, it } from "node:test";
import assert from "node:assert";
import { encryptSecret, decryptSecret, redactSecret } from "../dist/storage/crypto.js";
import { getDatabase, CredentialRepo, TaskRepo, BlueprintRepo, LandmarkRepo, PermissionRepo } from "../dist/storage/database.js";
import { perception } from "../dist/engine/perception.js";
import { building } from "../dist/engine/building-engine.js";
import { chatIntentParser } from "../dist/ai/intent-parser.js";
import { PROVIDER_PRESETS } from "../dist/ai/provider-pool.js";

describe("1. Security & Cryptography Suite", () => {
  it("should encrypt and decrypt secrets with AES-256-GCM", () => {
    const plain = "gsk_test_api_key_1234567890abcdef";
    const enc = encryptSecret(plain);

    assert.ok(enc.ciphertext && enc.ciphertext !== plain, "Ciphertext must be encrypted");
    assert.ok(enc.iv && enc.tag, "IV and auth tag must be present");

    const decrypted = decryptSecret(enc);
    assert.strictEqual(decrypted, plain, "Decrypted text must match original plain text");
  });

  it("should redact secrets safely for logs and UI", () => {
    const secret = "gsk_super_secret_token_123456";
    const redacted = redactSecret(secret);
    assert.ok(!redacted.includes("secret"), "Secret content must not be present in redacted output");
    assert.ok(redacted.includes("••••••••"), "Must contain bullet redaction mask");
  });
});

describe("2. Persistent SQLite Database Suite", () => {
  it("should initialize database and tables without errors", () => {
    const db = getDatabase();
    assert.ok(db, "Database instance must be initialized");
  });

  it("should store and retrieve encrypted API credentials", () => {
    const id = "test-cred-" + Date.now();
    const enc = encryptSecret("sk-or-test-key-mock");

    CredentialRepo.upsert({
      id,
      label: "Test OpenRouter Key",
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

    const retrieved = CredentialRepo.get(id);
    assert.ok(retrieved, "Credential must be stored and retrieved");
    assert.strictEqual(retrieved.label, "Test OpenRouter Key");
    assert.strictEqual(decryptSecret({ ciphertext: retrieved.encryptedKey, iv: retrieved.iv, tag: retrieved.tag }), "sk-or-test-key-mock");

    CredentialRepo.delete(id);
    assert.strictEqual(CredentialRepo.get(id), null, "Deleted credential must return null");
  });

  it("should persist and update task records with checkpoints", () => {
    const id = "task-" + Date.now();
    TaskRepo.upsert({
      id,
      type: "mine",
      title: "Mine 16 Oak Logs",
      requestedBy: "UnitTester",
      priority: 5,
      status: "pending",
      createdAt: Date.now(),
      checkpoint: {
        stepIndex: 4,
        totalSteps: 16,
        progressPercent: 25,
        data: { harvested: 4 },
        updatedAt: Date.now()
      },
      params: { resource: "wood", limit: 16 }
    });

    const task = TaskRepo.get(id);
    assert.ok(task, "Task must be retrieved");
    assert.strictEqual(task.checkpoint?.progressPercent, 25);

    TaskRepo.delete(id);
  });
});

describe("3. Construction & Blueprint Engine Suite", () => {
  it("should accurately calculate material manifests and missing blocks", () => {
    const blueprint = {
      id: "test-bp",
      name: "Test Structure",
      dimensions: { x: 2, y: 1, z: 2 },
      totalBlocks: 4,
      requiredMaterials: { oak_planks: 4 },
      blocks: [
        { relX: 0, relY: 0, relZ: 0, blockName: "oak_planks" },
        { relX: 1, relY: 0, relZ: 0, blockName: "oak_planks" },
        { relX: 0, relY: 0, relZ: 1, blockName: "oak_planks" },
        { relX: 1, relY: 0, relZ: 1, blockName: "oak_planks" }
      ],
      createdAt: Date.now()
    };

    const inventory = [
      { name: "oak_planks", count: 2 },
      { name: "stone", count: 64 }
    ];

    const manifest = building.calculateManifest(blueprint, inventory);
    assert.strictEqual(manifest.required.oak_planks, 4);
    assert.strictEqual(manifest.available.oak_planks, 2);
    assert.strictEqual(manifest.missing.oak_planks, 2);
    assert.strictEqual(manifest.canBuild, false, "Should indicate cannot build when materials are missing");
  });
});

describe("4. Chat Intent Parser & Security Suite", () => {
  it("should parse player follow commands safely", () => {
    const parsed = chatIntentParser.parse("Steve", "@nexus follow me", "@nexus");
    assert.strictEqual(parsed.isCommand, true);
    assert.strictEqual(parsed.type, "follow");
    assert.strictEqual(parsed.params.player_name, "Steve");
  });

  it("should block non-privileged players from scheduling mining", () => {
    PermissionRepo.upsert({
      username: "GrieferGuy",
      role: "guest",
      canCommandBot: true,
      canRequestMining: false,
      canRequestBuilding: false,
      canRequestStorage: false,
      canUseOpActions: false,
      updatedAt: Date.now()
    });

    const parsed = chatIntentParser.parse("GrieferGuy", "@nexus mine diamond", "@nexus");
    assert.strictEqual(parsed.type, "unauthorized");
    assert.ok(parsed.feedbackMessage.includes("permission"), "Must deny permission clearly");
  });

  it("should parse emergency stop commands immediately", () => {
    const parsed = chatIntentParser.parse("AdminPlayer", "@nexus stop", "@nexus");
    assert.strictEqual(parsed.isCommand, true);
    assert.strictEqual(parsed.params.action, "stop");
  });
});

describe("5. AI Provider Presets Suite", () => {
  it("should include all required provider presets including Google Gemini", () => {
    assert.ok(PROVIDER_PRESETS.openrouter, "OpenRouter preset must exist");
    assert.ok(PROVIDER_PRESETS.gemini, "Gemini preset must exist");
    assert.ok(PROVIDER_PRESETS.groq, "Groq preset must exist");
    assert.ok(PROVIDER_PRESETS.openai, "OpenAI preset must exist");
    assert.ok(PROVIDER_PRESETS.together, "Together preset must exist");
    assert.ok(PROVIDER_PRESETS.fireworks, "Fireworks preset must exist");
    assert.ok(PROVIDER_PRESETS.custom, "Custom preset must exist");
    assert.strictEqual(PROVIDER_PRESETS.gemini.defaultModel, "gemini-2.0-flash");
    assert.strictEqual(PROVIDER_PRESETS.gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  });

  it("should configure Groq with llama-3.3-70b-versatile default", () => {
    assert.strictEqual(PROVIDER_PRESETS.groq.defaultModel, "llama-3.3-70b-versatile");
  });
});

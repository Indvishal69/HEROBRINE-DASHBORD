import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import { Server as SocketServer } from "socket.io";
import { botService } from "../bot/connection.js";
import { manualControl } from "../bot/manual-control.js";
import { viewerManager } from "../viewer/viewer-manager.js";
import { perception } from "../engine/perception.js";
import { taskManager } from "../engine/task-manager.js";
import { aiPool, PROVIDER_PRESETS } from "../ai/provider-pool.js";
import { encryptSecret } from "../storage/crypto.js";
import { 
  CredentialRepo, 
  TaskRepo, 
  BlueprintRepo, 
  LandmarkRepo, 
  PermissionRepo, 
  AuditRepo,
  SessionRepo
} from "../storage/database.js";
import { storage } from "../engine/storage-manager.js";
import { farming } from "../engine/farming-manager.js";
import { mining } from "../engine/mining-manager.js";
import { combatManager } from "../engine/combat-manager.js";
import { foodManager } from "../engine/food-manager.js";
import { survival } from "../engine/survival-manager.js";
import { autonomyManager } from "../engine/autonomy-manager.js";
import { capabilityRegistry } from "../engine/capability-registry.js";
import { worldIntelligence } from "../engine/world-intelligence.js";
import { campaignPlanner } from "../engine/campaign-planner.js";
import { travelPlanner } from "../engine/travel-planner.js";
import { economyManager } from "../engine/economy-manager.js";
import { visionAdapter } from "../engine/vision-adapter.js";
import { buildTransactionManager } from "../engine/build-transactions.js";
import { eventTimeline } from "../engine/event-timeline.js";
import { clutchManager } from "../engine/clutch-manager.js";
import { chatIntentParser } from "../ai/intent-parser.js";

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "buddy123";

export function startServer(port: number) {
  const app = express();
  const webServer = http.createServer(app);
  const activeSessions = new Set<string>();

  app.use(express.json());

  // 1. REVERSE PROXY FOR 3D VIEWER
  const viewerPort = viewerManager.getViewerPort();
  app.use("/viewer", (req, res) => {
    const targetPath = req.url || "/";
    const headers = { ...req.headers };
    headers.host = `127.0.0.1:${viewerPort}`;
    delete headers.origin;
    delete headers.referer;

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: viewerPort,
        path: targetPath,
        method: req.method,
        headers
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", () => {
      res.status(503).send("3D Viewer is initializing or bot is connecting. Please wait a moment.");
    });

    req.pipe(proxyReq);
  });

  // 2. AUTHENTICATION HELPERS & ROUTES
  function checkToken(req: express.Request): boolean {
    const token = (req.headers["x-auth-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "")) as string;
    return Boolean(token && (activeSessions.has(token) || SessionRepo.has(token)));
  }

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!checkToken(req)) {
      return res.status(401).json({ error: "Unauthorized. Enter password to unlock dashboard." });
    }
    next();
  }

  app.post("/api/auth/login", (req, res) => {
    const password = String(req.body?.password || "").trim();
    if (password === DASHBOARD_PASSWORD) {
      const token = crypto.randomUUID();
      activeSessions.add(token);
      SessionRepo.add(token);
      return res.json({ ok: true, token, authenticated: true });
    }
    return res.status(401).json({ error: "Password galat hai! Please try again." });
  });

  app.get("/api/auth/check", (req, res) => {
    return res.json({ authenticated: checkToken(req) });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = (req.headers["x-auth-token"] || "") as string;
    if (token) {
      activeSessions.delete(token);
      SessionRepo.delete(token);
    }
    return res.json({ ok: true, authenticated: false });
  });

  // 3. STATIC FILES (NO CACHING)
  const publicDir = path.resolve(process.cwd(), "public");
  app.get("/", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
  app.use(express.static(publicDir, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }));

  // 4. SOCKET.IO REAL-TIME HUB
  const io = new SocketServer(webServer, {
    cors: { origin: true, credentials: true },
    allowRequest: (_req, cb) => cb(null, true)
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    (socket as any).authenticated = Boolean(token && (activeSessions.has(String(token)) || SessionRepo.has(String(token))));
    next();
  });

  io.on("connection", (socket) => {
    socket.on("authenticate", ({ token }) => {
      (socket as any).authenticated = Boolean(token && (activeSessions.has(String(token)) || SessionRepo.has(String(token))));
      socket.emit("auth-result", { authenticated: (socket as any).authenticated });
    });

    socket.on("bot-control", (data) => {
      if (!(socket as any).authenticated) return;
      const b = botService.getBot();
      if (b && data?.control) {
        manualControl.handleControlPress(b, String(data.control), Boolean(data.pressed));
      }
    });

    socket.on("bot-look", (data) => {
      if (!(socket as any).authenticated) return;
      const b = botService.getBot();
      if (b && data?.yaw != null && data?.pitch != null) {
        manualControl.handleLook(b, Number(data.yaw), Number(data.pitch));
      }
    });

    socket.on("bot-turn", (data) => {
      if (!(socket as any).authenticated) return;
      const b = botService.getBot();
      if (b && (data?.deltaYaw != null || data?.deltaPitch != null)) {
        manualControl.handleTurn(b, Number(data.deltaYaw || 0), Number(data.deltaPitch || 0));
      }
    });

    socket.on("bot-action", (data) => {
      if (!(socket as any).authenticated) return;
      const b = botService.getBot();
      if (!b) return;
      if (data?.action === "attack") {
        manualControl.handleAttack(b);
      } else if (data?.action === "use") {
        manualControl.handleUse(b);
      } else if (data?.action === "jump") {
        manualControl.handleControlPress(b, "jump", true);
        setTimeout(() => manualControl.handleControlPress(b, "jump", false), 350);
      } else if (data?.action === "stop") {
        manualControl.releaseAll(b);
      }
    });

    socket.on("manual-mode", ({ active }) => {
      if (!(socket as any).authenticated) return;
      manualControl.setManualActive(Boolean(active), botService.getBot());
      io.emit("manual-mode:status", { active: manualControl.isManualActive() });
    });
  });

  // Connect broadcast callback to bot service
  botService.setBroadcast((event, payload) => {
    io.emit(event, payload);
  });

  // 5. REST APIS
  app.get("/api/state", (req, res) => {
    const isAuth = checkToken(req);
    const snap = perception.captureSnapshot(botService.getBot(), taskManager.getActiveTask()?.title || null);
    snap.state = botService.getState();

    res.json({
      ...snap,
      settings: botService.getConfig(),
      viewerAvailable: viewerManager.isViewerActive(),
      viewerUrl: "/viewer/",
      authenticated: isAuth,
      clutch: clutchManager.getSnapshot(botService.getBot())
    });
  });

  // Connection endpoints
  app.get("/api/connection/settings", requireAuth, (_req, res) => {
    res.json(botService.getConfig());
  });

  app.post("/api/connection/settings", requireAuth, (req, res) => {
    botService.saveConfig(req.body);
    res.json({ ok: true, config: botService.getConfig() });
  });

  app.post("/api/connection/connect", requireAuth, async (_req, res) => {
    try {
      await botService.connect();
      res.json({ ok: true, state: botService.getState() });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/connection/disconnect", requireAuth, (_req, res) => {
    botService.disconnect();
    res.json({ ok: true, state: botService.getState() });
  });

  // Manual Control REST APIs
  app.post("/api/control/press", requireAuth, (req, res) => {
    const { control, pressed } = req.body;
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is not connected to a server." });
    manualControl.handleControlPress(b, String(control), Boolean(pressed));
    res.json({ ok: true, active: manualControl.isManualActive() });
  });

  app.post("/api/control/look", requireAuth, (req, res) => {
    const { yaw, pitch, deltaYaw, deltaPitch } = req.body;
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is not connected to a server." });
    if (deltaYaw != null || deltaPitch != null) {
      manualControl.handleTurn(b, Number(deltaYaw || 0), Number(deltaPitch || 0));
    } else if (yaw != null && pitch != null) {
      manualControl.handleLook(b, Number(yaw), Number(pitch));
    }
    res.json({ ok: true, active: manualControl.isManualActive() });
  });

  app.post("/api/control/action", requireAuth, (req, res) => {
    const { action } = req.body;
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is not connected to a server." });
    if (action === "attack") {
      manualControl.handleAttack(b);
    } else if (action === "use") {
      manualControl.handleUse(b);
    } else if (action === "jump") {
      manualControl.handleControlPress(b, "jump", true);
      setTimeout(() => manualControl.handleControlPress(b, "jump", false), 350);
    } else if (action === "stop") {
      manualControl.releaseAll(b);
    }
    res.json({ ok: true, active: manualControl.isManualActive() });
  });

  app.post("/api/control/mode", requireAuth, (req, res) => {
    const { active } = req.body;
    manualControl.setManualActive(Boolean(active), botService.getBot());
    io.emit("manual-mode:status", { active: manualControl.isManualActive() });
    res.json({ ok: true, active: manualControl.isManualActive() });
  });

  // AI Pool Endpoints
  app.get("/api/ai/pool", requireAuth, (_req, res) => {
    const pool = CredentialRepo.getAll().map((c) => ({
      ...c,
      encryptedKey: undefined,
      iv: undefined,
      tag: undefined
    }));
    res.json({ pool, presets: PROVIDER_PRESETS, config: aiPool.getConfig() });
  });

  app.post("/api/ai/pool/add", requireAuth, (req, res) => {
    const { label, provider, apiKey, baseUrl, preferredModel, spendBudgetLimit } = req.body;
    const sanitizedKey = String(apiKey || "").trim().replace(/^["']|["']$/g, "").trim();
    if (!sanitizedKey || sanitizedKey.length < 5) return res.status(400).json({ error: "Invalid API key." });

    const enc = encryptSecret(sanitizedKey);
    const preset = PROVIDER_PRESETS[provider as keyof typeof PROVIDER_PRESETS] || PROVIDER_PRESETS.openrouter;

    const entry = {
      id: crypto.randomUUID(),
      label: label || `${preset.name} (${preferredModel || preset.defaultModel})`,
      provider: provider || "openrouter",
      encryptedKey: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      baseUrl: baseUrl || preset.baseUrl,
      preferredModel: preferredModel || preset.defaultModel,
      enabled: true,
      health: "healthy" as const,
      requestsCount: 0,
      failureCount: 0,
      spendBudgetLimit: spendBudgetLimit ? Number(spendBudgetLimit) : undefined
    };

    CredentialRepo.upsert(entry);
    res.json({ ok: true, entry: { ...entry, encryptedKey: undefined, iv: undefined, tag: undefined } });
  });

  app.post("/api/ai/pool/:id/test", requireAuth, async (req, res) => {
    try {
      const result = await aiPool.testCredential(String(req.params.id));
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.delete("/api/ai/pool/:id", requireAuth, (req, res) => {
    CredentialRepo.delete(String(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/ai/config", requireAuth, (req, res) => {
    aiPool.updateConfig(req.body);
    res.json({ ok: true, config: aiPool.getConfig() });
  });

  // Tasks Endpoints
  app.get("/api/tasks", requireAuth, (_req, res) => {
    res.json({ active: taskManager.getActiveTask(), queue: TaskRepo.getAll() });
  });

  app.post("/api/tasks/create", requireAuth, (req, res) => {
    const { type, title, params, priority } = req.body;
    const task = taskManager.createTask(type, title, params, "dashboard", priority || 5);
    res.json({ ok: true, task });
  });

  app.post("/api/tasks/:id/cancel", requireAuth, (req, res) => {
    res.json({ ok: taskManager.cancelTask(String(req.params.id)) });
  });

  app.post("/api/tasks/:id/pause", requireAuth, (req, res) => {
    res.json({ ok: taskManager.pauseTask(String(req.params.id)) });
  });

  app.post("/api/tasks/:id/resume", requireAuth, (req, res) => {
    res.json({ ok: taskManager.resumeTask(String(req.params.id)) });
  });

  // Blueprints Endpoints
  app.get("/api/blueprints", requireAuth, (_req, res) => {
    res.json(BlueprintRepo.getAll());
  });

  app.post("/api/blueprints/create", requireAuth, (req, res) => {
    const bp = {
      id: crypto.randomUUID(),
      name: req.body.name,
      description: req.body.description,
      dimensions: req.body.dimensions || { x: 3, y: 3, z: 3 },
      totalBlocks: req.body.blocks?.length || 0,
      requiredMaterials: req.body.requiredMaterials || {},
      blocks: req.body.blocks || [],
      createdAt: Date.now()
    };
    BlueprintRepo.upsert(bp);
    res.json({ ok: true, blueprint: bp });
  });

  // Memory Endpoints
  app.get("/api/memory/landmarks", requireAuth, (_req, res) => {
    res.json(LandmarkRepo.getAll());
  });

  app.post("/api/memory/landmarks", requireAuth, (req, res) => {
    const landmark = {
      id: crypto.randomUUID(),
      name: req.body.name,
      category: req.body.category || "poi",
      coordinates: req.body.coordinates,
      dimension: req.body.dimension || "overworld",
      description: req.body.description,
      tags: req.body.tags || [],
      createdAt: Date.now()
    };
    LandmarkRepo.upsert(landmark);
    res.json({ ok: true, landmark });
  });

  app.delete("/api/memory/landmarks/:id", requireAuth, (req, res) => {
    LandmarkRepo.delete(String(req.params.id));
    res.json({ ok: true });
  });

  // Permissions & Audit Logs
  app.get("/api/permissions", requireAuth, (_req, res) => {
    res.json(PermissionRepo.getAll());
  });

  app.post("/api/permissions", requireAuth, (req, res) => {
    PermissionRepo.upsert({ ...req.body, updatedAt: Date.now() });
    res.json({ ok: true });
  });

  app.get("/api/logs", requireAuth, (_req, res) => {
    res.json(AuditRepo.getRecent(100));
  });

  // Actions
  app.post("/api/actions/harvest", requireAuth, async (_req, res) => {
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is offline." });
    try {
      const out = await farming.harvestAndReplant(b);
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/actions/deposit", requireAuth, async (req, res) => {
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is offline." });
    try {
      const out = await storage.depositCategory(b, req.body.category || "all_except_hotbar");
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/actions/mine", requireAuth, async (req, res) => {
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is offline." });
    try {
      const out = await mining.mineResource(b, req.body.resource || "wood", Number(req.body.count || 8));
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ======================== COMBAT & PVP ROUTES ========================
  app.get("/api/combat/status", requireAuth, (req, res) => {
    res.json(combatManager.getSnapshot(botService.getBot()));
  });

  app.get("/api/combat/config", requireAuth, (req, res) => {
    res.json(combatManager.getConfig());
  });

  app.post("/api/combat/config", requireAuth, (req, res) => {
    res.json(combatManager.saveConfig(req.body));
  });

  app.post("/api/combat/start-duel", requireAuth, (req, res) => {
    const opponent = String(req.body.opponent || "").trim();
    if (!opponent) return res.status(400).json({ error: "Opponent username is required." });
    res.json(combatManager.startApprovedDuel(opponent));
  });

  app.post("/api/combat/stop", requireAuth, (req, res) => {
    combatManager.stopCombat(String(req.body.reason || "Manual dashboard stop"));
    res.json({ success: true, message: "Combat disengaged." });
  });

  app.post("/api/combat/retreat", requireAuth, (req, res) => {
    combatManager.triggerEmergencyRetreat(botService.getBot(), String(req.body.reason || "Dashboard emergency retreat"));
    res.json({ success: true, message: "Emergency retreat triggered." });
  });

  app.get("/api/combat/logs", requireAuth, (req, res) => {
    res.json(combatManager.getCombatLogs());
  });

  // ======================== SURVIVAL & SMART FOOD ROUTES ========================
  app.get("/api/survival/status", requireAuth, (req, res) => {
    res.json(survival.getSnapshot(botService.getBot()));
  });

  app.get("/api/survival/config", requireAuth, (req, res) => {
    res.json(foodManager.getConfig());
  });

  app.post("/api/survival/config", requireAuth, (req, res) => {
    res.json(foodManager.saveConfig(req.body));
  });

  app.post("/api/survival/eat-now", requireAuth, async (req, res) => {
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is offline." });
    try {
      const eatRes = await foodManager.executeEat(b, true, "C_ROUTINE_HUNGER");
      res.json(eatRes);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/survival/emergency-recovery", requireAuth, async (req, res) => {
    const b = botService.getBot();
    const result = await survival.triggerEmergencyRecovery(b);
    res.json(result);
  });

  app.get("/api/survival/forecast", requireAuth, (req, res) => {
    const minutes = Number(req.query.minutes || 20);
    res.json(foodManager.forecastFoodSupply(botService.getBot(), minutes));
  });

  app.get("/api/survival/logs", requireAuth, (req, res) => {
    res.json(foodManager.getFoodLogs());
  });

  // ======================== AUTONOMY & CAPABILITY ROUTES ========================
  app.get("/api/autonomy/config", requireAuth, (req, res) => {
    res.json(autonomyManager.getConfig());
  });

  app.post("/api/autonomy/config", requireAuth, (req, res) => {
    res.json(autonomyManager.saveConfig(req.body));
  });

  app.post("/api/autonomy/level", requireAuth, (req, res) => {
    const level = Number(req.body.level);
    res.json(autonomyManager.setLevel(level as any));
  });

  app.get("/api/capabilities", requireAuth, (req, res) => {
    res.json(capabilityRegistry.getAll());
  });

  // ======================== WORLD INTELLIGENCE & TRAVEL ROUTES ========================
  app.get("/api/world/snapshot", requireAuth, (req, res) => {
    const dim = (botService.getBot()?.game as any)?.dimension || "overworld";
    res.json(worldIntelligence.getSnapshot(dim));
  });

  app.get("/api/world/landmarks", requireAuth, (req, res) => {
    res.json(worldIntelligence.getLandmarks(req.query.includeStale !== "true"));
  });

  app.post("/api/world/landmarks", requireAuth, (req, res) => {
    const lm = worldIntelligence.recordLandmark(
      req.body.name,
      req.body.category,
      req.body.position,
      req.body.dimension,
      "player_reported",
      req.body.ttlMs,
      req.body.metadata
    );
    res.json(lm);
  });

  app.post("/api/travel/checklist", requireAuth, (req, res) => {
    res.json(travelPlanner.checkTravelReadiness(
      botService.getBot(),
      req.body.targetPos,
      req.body.targetDimension
    ));
  });

  // ======================== CAMPAIGN PLANNER ROUTES ========================
  app.get("/api/campaigns", requireAuth, (req, res) => {
    res.json(campaignPlanner.getAll());
  });

  app.post("/api/campaigns", requireAuth, (req, res) => {
    res.json(campaignPlanner.createCampaign(
      req.body.title,
      req.body.description,
      req.body.category,
      req.body.stages
    ));
  });

  app.post("/api/campaigns/:id/start", requireAuth, (req, res) => {
    res.json({ success: campaignPlanner.startCampaign(String(req.params.id)) });
  });

  app.post("/api/campaigns/:id/pause", requireAuth, (req, res) => {
    res.json({ success: campaignPlanner.pauseCampaign(String(req.params.id)) });
  });

  app.post("/api/campaigns/:id/cancel", requireAuth, (req, res) => {
    res.json({ success: campaignPlanner.cancelCampaign(String(req.params.id)) });
  });

  app.post("/api/campaigns/:id/advance", requireAuth, (req, res) => {
    res.json({ success: campaignPlanner.advanceStage(String(req.params.id), req.body.evidence) });
  });

  // ======================== ECONOMY & VILLAGER ROUTES ========================
  app.get("/api/economy/villagers", requireAuth, (req, res) => {
    res.json(economyManager.discoverNearbyVillagers(botService.getBot()));
  });

  app.post("/api/economy/validate-trade", requireAuth, (req, res) => {
    const b = botService.getBot();
    if (!b) return res.status(400).json({ error: "Bot is offline." });
    res.json(economyManager.validateTradeFeasibility(b, req.body.offer));
  });

  // ======================== VISION & VOICE ROUTES ========================
  app.get("/api/vision/capture", requireAuth, async (req, res) => {
    const out = await visionAdapter.captureScene(botService.getBot());
    res.json(out);
  });

  app.post("/api/voice/command", requireAuth, (req, res) => {
    const transcript = String(req.body.transcript || "").trim();
    if (!transcript) return res.status(400).json({ error: "Voice transcript cannot be empty." });

    const intent = chatIntentParser.parse("voice_operator", transcript);
    if (intent.isCommand) {
      const task = taskManager.createTask(intent.type as any, intent.title, intent.params, "voice_operator");
      return res.json({ success: true, transcript, intent, task });
    }
    res.json({ success: true, transcript, intent });
  });

  // ======================== BUILD TRANSACTIONS & ROLLBACK ========================
  app.get("/api/transactions", requireAuth, (req, res) => {
    res.json(buildTransactionManager.getAll());
  });

  app.post("/api/transactions/:id/rollback", requireAuth, async (req, res) => {
    const result = await buildTransactionManager.rollbackTransaction(botService.getBot(), String(req.params.id));
    res.json(result);
  });

  // ======================== EVENT TIMELINE & SANITIZED EXPORT ========================
  app.get("/api/timeline", requireAuth, (req, res) => {
    res.json(eventTimeline.getEvents(req.query.category as string, Number(req.query.limit || 50)));
  });

  app.get("/api/timeline/export", requireAuth, (req, res) => {
    res.setHeader("Content-Disposition", "attachment; filename=nexus_diagnostics.json");
    res.setHeader("Content-Type", "application/json");
    res.send(eventTimeline.exportSanitizedDiagnostics());
  });

  // ======================== MLG CLUTCH & FALL-RECOVERY ========================
  app.get("/api/clutch/status", requireAuth, (_req, res) => {
    res.json(clutchManager.getSnapshot(botService.getBot()));
  });

  app.post("/api/clutch/mode", requireAuth, (req, res) => {
    const { mode, triggerDistanceBlocks, triggerTimeMs, autoRecoverWater, steerToNearbySafeSurfaces } = req.body;
    clutchManager.updateConfig({
      mode,
      triggerDistanceBlocks: triggerDistanceBlocks ? Number(triggerDistanceBlocks) : undefined,
      triggerTimeMs: triggerTimeMs ? Number(triggerTimeMs) : undefined,
      autoRecoverWater: autoRecoverWater !== undefined ? Boolean(autoRecoverWater) : undefined,
      steerToNearbySafeSurfaces: steerToNearbySafeSurfaces !== undefined ? Boolean(steerToNearbySafeSurfaces) : undefined
    });
    res.json({ success: true, config: clutchManager.getConfig(), snapshot: clutchManager.getSnapshot(botService.getBot()) });
  });

  app.get("/api/clutch/stats", requireAuth, (_req, res) => {
    res.json(clutchManager.getStats());
  });

  app.post("/api/clutch/arena/test", requireAuth, async (req, res) => {
    const { fallHeight, surfaceType, dimension } = req.body;
    const bot = botService.getBot();
    const result = await clutchManager.runArenaDrill(bot as any, {
      fallHeight: Number(fallHeight || 20),
      surfaceType: surfaceType || "stone",
      dimension: dimension || "overworld"
    });
    res.json(result);
  });

  // WebSocket upgrade proxy for 3D viewer
  webServer.on("upgrade", (req, clientSocket, head) => {
    if (req.url && req.url.startsWith("/viewer")) {
      const targetPath = req.url.replace(/^\/viewer/, "") || "/";
      const headers = { ...req.headers };
      headers.host = `127.0.0.1:${viewerPort}`;
      delete headers.origin;
      delete headers.referer;

      const proxySocket = net.connect(viewerPort, "127.0.0.1", () => {
        proxySocket.write(
          `${req.method} ${targetPath} HTTP/1.1\r\n` +
          Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
          "\r\n\r\n"
        );
        if (head.length > 0) proxySocket.write(head);
        clientSocket.pipe(proxySocket).pipe(clientSocket);
      });

      proxySocket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => proxySocket.destroy());
    }
  });

  // Start HTTP Web Server
  webServer.listen(port, "0.0.0.0", () => {
    console.error(`[Minecraft Nexus AI] Dashboard active on http://0.0.0.0:${port}`);
    console.error(`[Minecraft Nexus AI] Security Password: "${DASHBOARD_PASSWORD}"`);
  });

  return { app, webServer, io };
}

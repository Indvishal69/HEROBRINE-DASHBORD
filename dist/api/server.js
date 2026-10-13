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
import { CredentialRepo, TaskRepo, BlueprintRepo, LandmarkRepo, PermissionRepo, AuditRepo } from "../storage/database.js";
import { storage } from "../engine/storage-manager.js";
import { farming } from "../engine/farming-manager.js";
import { mining } from "../engine/mining-manager.js";
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "buddy123";
export function startServer(port) {
    const app = express();
    const webServer = http.createServer(app);
    const activeSessions = new Set();
    app.use(express.json());
    // 1. REVERSE PROXY FOR 3D VIEWER
    const viewerPort = viewerManager.getViewerPort();
    app.use("/viewer", (req, res) => {
        const targetPath = req.url || "/";
        const headers = { ...req.headers };
        headers.host = `127.0.0.1:${viewerPort}`;
        delete headers.origin;
        delete headers.referer;
        const proxyReq = http.request({
            hostname: "127.0.0.1",
            port: viewerPort,
            path: targetPath,
            method: req.method,
            headers
        }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
        });
        proxyReq.on("error", () => {
            res.status(503).send("3D Viewer is initializing or bot is connecting. Please wait a moment.");
        });
        req.pipe(proxyReq);
    });
    // 2. AUTHENTICATION HELPERS & ROUTES
    function checkToken(req) {
        const token = (req.headers["x-auth-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
        return Boolean(token && activeSessions.has(token));
    }
    function requireAuth(req, res, next) {
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
            return res.json({ ok: true, token, authenticated: true });
        }
        return res.status(401).json({ error: "Password galat hai! Please try again." });
    });
    app.get("/api/auth/check", (req, res) => {
        return res.json({ authenticated: checkToken(req) });
    });
    app.post("/api/auth/logout", (req, res) => {
        const token = (req.headers["x-auth-token"] || "");
        if (token)
            activeSessions.delete(token);
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
        socket.authenticated = Boolean(token && activeSessions.has(String(token)));
        next();
    });
    io.on("connection", (socket) => {
        socket.on("authenticate", ({ token }) => {
            socket.authenticated = Boolean(token && activeSessions.has(String(token)));
            socket.emit("auth-result", { authenticated: socket.authenticated });
        });
        socket.on("bot-control", (data) => {
            if (!socket.authenticated)
                return;
            const b = botService.getBot();
            if (b && data?.control) {
                manualControl.handleControlPress(b, String(data.control), Boolean(data.pressed));
            }
        });
        socket.on("bot-look", (data) => {
            if (!socket.authenticated)
                return;
            const b = botService.getBot();
            if (b && data?.yaw != null && data?.pitch != null) {
                manualControl.handleLook(b, Number(data.yaw), Number(data.pitch));
            }
        });
        socket.on("manual-mode", ({ active }) => {
            if (!socket.authenticated)
                return;
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
            authenticated: isAuth
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
        }
        catch (e) {
            res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
        }
    });
    app.post("/api/connection/disconnect", requireAuth, (_req, res) => {
        botService.disconnect();
        res.json({ ok: true, state: botService.getState() });
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
        if (!apiKey || apiKey.length < 5)
            return res.status(400).json({ error: "Invalid API key." });
        const enc = encryptSecret(apiKey.trim());
        const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.openrouter;
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
            health: "healthy",
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
        }
        catch (e) {
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
        if (!b)
            return res.status(400).json({ error: "Bot is offline." });
        try {
            const out = await farming.harvestAndReplant(b);
            res.json(out);
        }
        catch (e) {
            res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
        }
    });
    app.post("/api/actions/deposit", requireAuth, async (req, res) => {
        const b = botService.getBot();
        if (!b)
            return res.status(400).json({ error: "Bot is offline." });
        try {
            const out = await storage.depositCategory(b, req.body.category || "all_except_hotbar");
            res.json(out);
        }
        catch (e) {
            res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
        }
    });
    app.post("/api/actions/mine", requireAuth, async (req, res) => {
        const b = botService.getBot();
        if (!b)
            return res.status(400).json({ error: "Bot is offline." });
        try {
            const out = await mining.mineResource(b, req.body.resource || "wood", Number(req.body.count || 8));
            res.json(out);
        }
        catch (e) {
            res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
        }
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
                proxySocket.write(`${req.method} ${targetPath} HTTP/1.1\r\n` +
                    Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
                    "\r\n\r\n");
                if (head.length > 0)
                    proxySocket.write(head);
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

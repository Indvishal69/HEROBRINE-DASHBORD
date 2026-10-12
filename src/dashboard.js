import crypto from "node:crypto";
import express from "express";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server as SocketServer } from "socket.io";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "buddy123";
const activeSessions = new Set();

export function startDashboard({ port, viewerPort, getState, executeTool, saveSettings, connectAI, saveAIOptions, disconnectAI }) {
  const app = express();
  const webServer = http.createServer(app);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  // CORS and origin handling (supports localhost, local network, and Render domains)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-auth-token");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Redirect /viewer to /viewer/ so relative resources resolve cleanly
  app.use((req, res, next) => {
    if (req.path === "/viewer") return res.redirect("/viewer/");
    next();
  });

  // 1. REVERSE PROXY FOR 3D VIEWER (Essential for Render & Single-Port Access)
  app.use("/viewer", (req, res) => {
    const targetPath = req.url || "/";
    const options = {
      hostname: "127.0.0.1",
      port: viewerPort,
      path: targetPath,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${viewerPort}` }
    };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", () => {
      res.status(503).send("3D Viewer is starting or bot is connecting. Please wait a moment and refresh.");
    });
    req.pipe(proxyReq);
  });

  // 2. AUTHENTICATION MIDDLEWARE & ENDPOINTS
  function checkToken(req) {
    const token = req.headers["x-auth-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    return Boolean(token && activeSessions.has(token));
  }

  function requireAuth(req, res, next) {
    if (!checkToken(req)) {
      return res.status(401).json({ error: "Unauthorized. Enter the dashboard password to continue." });
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
    return res.status(401).json({ error: "Password galat hai! Please check and try again." });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = req.headers["x-auth-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (token) activeSessions.delete(token);
    return res.json({ ok: true, authenticated: false });
  });

  app.get("/api/auth/check", (req, res) => {
    return res.json({ authenticated: checkToken(req) });
  });

  // Static files
  app.use(express.static(publicDirectory, { etag: true, maxAge: "1h" }));

  // Socket.IO with auth support
  const io = new SocketServer(webServer, {
    cors: { origin: true, credentials: true },
    allowRequest: (_req, callback) => callback(null, true)
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    socket.authenticated = Boolean(token && activeSessions.has(token));
    next();
  });

  // State endpoint
  app.get("/api/state", (req, res) => {
    const isAuth = checkToken(req);
    const state = getState({ viewerPort });
    // In production or Render, provide /viewer/ for single-port access
    const hostHeader = req.get("host") || "";
    const isLocal = hostHeader.includes("localhost") || hostHeader.includes("127.0.0.1");
    const viewerUrl = isLocal ? `http://127.0.0.1:${viewerPort}` : `/viewer/`;
    res.json({ ...state, viewerUrl, authenticated: isAuth });
  });

  // Protected API Endpoints
  app.post("/api/settings", requireAuth, async (req, res) => {
    try {
      res.json({ settings: await saveSettings(req.body) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/ai/connect", requireAuth, async (req, res) => {
    try {
      res.json({ ai: await connectAI(req.body ?? {}) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/ai/settings", requireAuth, async (req, res) => {
    try {
      res.json({ ai: await saveAIOptions(req.body ?? {}) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/ai/disconnect", requireAuth, (_req, res) => res.json({ ai: disconnectAI() }));

  app.post("/api/tool/:name", requireAuth, async (req, res) => {
    try {
      res.json({ result: await executeTool(req.params.name, req.body ?? {}) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Socket.io real-time connection
  io.on("connection", (socket) => {
    socket.emit("state", getState({ viewerPort }));

    socket.on("authenticate", ({ token }) => {
      socket.authenticated = Boolean(token && activeSessions.has(token));
      socket.emit("auth-result", { authenticated: socket.authenticated });
    });

    socket.on("bot-control", async (data) => {
      if (!socket.authenticated) return;
      try {
        if (data?.control) await executeTool("minecraft_press_control", { control: data.control, pressed: Boolean(data.pressed) });
      } catch {}
    });

    socket.on("bot-look", async (data) => {
      if (!socket.authenticated) return;
      try {
        if (data?.yaw != null && data?.pitch != null) {
          await executeTool("minecraft_look", { yaw: Number(data.yaw), pitch: Number(data.pitch) });
        }
      } catch {}
    });

    socket.on("bot-interact", async (data) => {
      if (!socket.authenticated) return;
      try {
        await executeTool("minecraft_interact_target", { action: data?.action || "attack" });
      } catch {}
    });

    socket.on("bot-slot", async (data) => {
      if (!socket.authenticated) return;
      try {
        if (data?.slot != null) await executeTool("minecraft_select_slot", { slot: Number(data.slot) });
      } catch {}
    });

    socket.on("bot-drop", async () => {
      if (!socket.authenticated) return;
      try {
        await executeTool("minecraft_drop_held", {});
      } catch {}
    });
  });

  const updates = setInterval(() => io.emit("state", getState({ viewerPort })), 900);

  // WEBSOCKET UPGRADE PROXY FOR VIEWER
  webServer.on("upgrade", (req, clientSocket, head) => {
    if (req.url.startsWith("/viewer")) {
      const targetPath = req.url.replace(/^\/viewer/, "") || "/";
      const proxySocket = net.connect(viewerPort, "127.0.0.1", () => {
        proxySocket.write(
          `${req.method} ${targetPath} HTTP/1.1\r\n` +
          Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
          "\r\n\r\n"
        );
        if (head.length > 0) proxySocket.write(head);
        clientSocket.pipe(proxySocket).pipe(clientSocket);
      });
      proxySocket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => proxySocket.destroy());
    }
  });

  webServer.on("error", (error) => {
    console.error(`[minecraft-ai-buddy] Dashboard error: ${error.message}`);
  });

  // Listen on 0.0.0.0 (Supports Render, Docker, and Localhost)
  webServer.listen(port, "0.0.0.0", () => {
    console.error(`[minecraft-ai-buddy] Dashboard active on http://0.0.0.0:${port}`);
    console.error(`[minecraft-ai-buddy] Default Dashboard Password: "${DASHBOARD_PASSWORD}" (Set DASHBOARD_PASSWORD env var to change)`);
  });

  return {
    emit: (event, payload) => io.emit(event, payload),
    close: () => {
      clearInterval(updates);
      io.close();
      webServer.close();
    }
  };
}

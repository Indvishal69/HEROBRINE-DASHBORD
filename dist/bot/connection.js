import mineflayer from "mineflayer";
import pathfinderPackage from "mineflayer-pathfinder";
import { viewerManager } from "../viewer/viewer-manager.js";
import { survival } from "../engine/survival-manager.js";
import { taskManager } from "../engine/task-manager.js";
import { chatIntentParser } from "../ai/intent-parser.js";
import { aiPool } from "../ai/provider-pool.js";
import { perception } from "../engine/perception.js";
import { manualControl } from "./manual-control.js";
import { combatManager } from "../engine/combat-manager.js";
import { actionCoordinator } from "../engine/action-coordinator.js";
import { proactiveScheduler } from "../engine/proactive-scheduler.js";
import { AppSettingsRepo, AuditRepo } from "../storage/database.js";
const { pathfinder, Movements } = pathfinderPackage;
export class BotConnectionService {
    bot = null;
    state = "disconnected";
    lastError = null;
    autoReconnectTimer = null;
    autonomousLoopTimer = null;
    deliberateDisconnect = false;
    broadcastCallback;
    setBroadcast(cb) {
        this.broadcastCallback = cb;
    }
    getBot() {
        return this.bot;
    }
    getState() {
        return this.state;
    }
    getLastError() {
        return this.lastError;
    }
    getConfig() {
        return AppSettingsRepo.get("connection_config", {
            host: process.env.MC_HOST || "phantomhorizon549.mcsh.io",
            port: Number(process.env.MC_PORT || 25565),
            version: process.env.MC_VERSION || "auto",
            auth: process.env.MC_AUTH || "offline",
            username: process.env.MC_USERNAME || "MinecraftBuddy"
        });
    }
    saveConfig(config) {
        AppSettingsRepo.set("connection_config", config);
    }
    async connect() {
        if (this.bot?.entity && this.state === "connected")
            return;
        this.deliberateDisconnect = false;
        this.state = "connecting";
        this.lastError = null;
        this.broadcastState();
        const config = this.getConfig();
        const options = {
            host: config.host,
            port: config.port,
            username: config.username,
            auth: config.auth,
            hideErrors: true
        };
        if (config.version && config.version.toLowerCase() !== "auto") {
            options.version = config.version;
        }
        else if (config.host.includes("phantomhorizon549") || config.host.includes("mcsh.io")) {
            options.version = "1.21.1";
        }
        try {
            const candidate = mineflayer.createBot(options);
            this.bot = candidate;
            candidate.loadPlugin(pathfinder);
            candidate.on("spawn", () => {
                candidate.pathfinder.setMovements(new Movements(candidate));
                this.state = "connected";
                this.lastError = null;
                viewerManager.start(candidate);
                this.startAutonomousLoop(candidate);
                this.broadcastState();
                AuditRepo.add({
                    id: String(Date.now()),
                    timestamp: Date.now(),
                    actor: "system",
                    action: "bot_spawned",
                    component: "bot_connection",
                    severity: "info",
                    details: { username: candidate.username, host: config.host }
                });
            });
            candidate.on("death", () => {
                console.error("[Nexus Bot] Bot died! Auto-respawning in 1.5s...");
                setTimeout(() => {
                    try {
                        candidate.respawn();
                    }
                    catch { }
                }, 1500);
            });
            candidate.on("chat", (username, message) => {
                this.handleChat(username, message);
            });
            candidate.on("whisper", (username, message) => {
                this.handleChat(username, message);
            });
            candidate.on("kicked", (reason) => {
                const msg = typeof reason === "object" ? JSON.stringify(reason) : String(reason);
                console.error(`[Nexus Bot] Kicked from server: ${msg}`);
                this.lastError = `Kicked: ${msg}`;
            });
            candidate.on("error", (err) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[Nexus Bot] Protocol error: ${msg}`);
                this.lastError = msg;
            });
            candidate.on("end", (reason) => {
                console.error(`[Nexus Bot] Disconnected: ${reason || "closed"}`);
                this.cleanup();
                this.state = "disconnected";
                if (reason)
                    this.lastError = String(reason);
                this.broadcastState();
                if (!this.deliberateDisconnect) {
                    this.scheduleReconnect();
                }
            });
        }
        catch (e) {
            this.state = "error";
            this.lastError = e instanceof Error ? e.message : String(e);
            this.broadcastState();
            throw e;
        }
    }
    disconnect() {
        this.deliberateDisconnect = true;
        if (this.autoReconnectTimer) {
            clearTimeout(this.autoReconnectTimer);
            this.autoReconnectTimer = null;
        }
        this.cleanup();
        this.state = "disconnected";
        this.broadcastState();
    }
    cleanup() {
        if (this.autonomousLoopTimer) {
            clearInterval(this.autonomousLoopTimer);
            this.autonomousLoopTimer = null;
        }
        actionCoordinator.forceReleaseAll();
        combatManager.stopCombat("Bot disconnected");
        viewerManager.close();
        if (this.bot) {
            try {
                this.bot.pathfinder?.setGoal(null);
                this.bot.clearControlStates();
                this.bot.quit("Nexus companion disconnecting");
            }
            catch { }
            this.bot = null;
        }
    }
    scheduleReconnect() {
        if (this.autoReconnectTimer)
            return;
        this.state = "recovering";
        this.broadcastState();
        console.error("[Nexus Bot] Reconnecting in 5s...");
        this.autoReconnectTimer = setTimeout(async () => {
            this.autoReconnectTimer = null;
            if (this.deliberateDisconnect)
                return;
            try {
                await this.connect();
            }
            catch {
                this.scheduleReconnect();
            }
        }, 5000);
    }
    startAutonomousLoop(candidate) {
        if (this.autonomousLoopTimer)
            clearInterval(this.autonomousLoopTimer);
        this.autonomousLoopTimer = setInterval(async () => {
            if (this.bot !== candidate || !candidate.entity)
                return;
            // 1. Skip autonomous actions if user has manual control active
            if (manualControl.isManualActive())
                return;
            // 2. Tick combat manager (PVP / mob defense)
            try {
                await combatManager.tick(candidate);
            }
            catch { }
            // 3. Evaluate survival priorities (eat, armor, hazards)
            try {
                await survival.evaluate(candidate);
            }
            catch { }
            // 4. Tick proactive scheduler (food audits, etc.)
            try {
                proactiveScheduler.tick(candidate);
            }
            catch { }
            // 5. Tick active hierarchical tasks
            try {
                await taskManager.tick(candidate, this.broadcastCallback);
            }
            catch { }
        }, 1500);
    }
    async handleChat(username, message) {
        if (!this.bot || username === this.bot.username)
            return;
        this.broadcastCallback?.("bot:chat", { username, message, at: new Date().toISOString() });
        const intent = chatIntentParser.parse(username, message);
        if (intent.type === "ignored")
            return;
        if (intent.feedbackMessage) {
            this.bot.chat(intent.feedbackMessage);
        }
        if (intent.isCommand) {
            taskManager.createTask(intent.type, intent.title, intent.params, username);
            return;
        }
        // Conversational LLM response
        if (intent.type === "chat_reply") {
            try {
                const snap = perception.captureSnapshot(this.bot, taskManager.getActiveTask()?.title || null);
                const worldContext = perception.compressForPrompt(snap);
                const reply = await aiPool.completeChat([
                    {
                        role: "system",
                        content: `You are Nexus, a helpful and natural Minecraft companion player on a survival server. Reply in 1-2 friendly, casual sentences without quotes. Never execute commands or pretend to be anything other than a player.\n${worldContext}`
                    },
                    { role: "user", content: `${username} says: "${message}"` }
                ]);
                if (reply && this.bot) {
                    this.bot.chat(reply);
                }
            }
            catch (e) {
                console.error(`[Nexus AI] Chat response error: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    broadcastState() {
        const snap = perception.captureSnapshot(this.bot, taskManager.getActiveTask()?.title || null);
        snap.state = this.state;
        this.broadcastCallback?.("bot:status", snap);
    }
}
export const botService = new BotConnectionService();

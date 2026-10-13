import { AppSettingsRepo } from "../storage/database.js";
export class MultiAgentManager {
    botId;
    constructor() {
        this.botId = process.env.BOT_INSTANCE_ID || "nexus-bot-primary";
    }
    getBotId() {
        return this.botId;
    }
    acquireTaskLease(taskId, leaseDurationMs = 60000) {
        const leases = AppSettingsRepo.get("task_leases", {});
        const now = Date.now();
        const existing = leases[taskId];
        if (existing && existing.leasedToBotId !== this.botId && now < existing.expiresAt) {
            // Leased to another bot and not yet expired
            return { acquired: false, leasedBy: existing.leasedToBotId };
        }
        // Grant lease
        leases[taskId] = {
            taskId,
            leasedToBotId: this.botId,
            leasedAt: now,
            expiresAt: now + leaseDurationMs
        };
        AppSettingsRepo.set("task_leases", leases);
        return { acquired: true, leasedBy: this.botId };
    }
    releaseTaskLease(taskId) {
        const leases = AppSettingsRepo.get("task_leases", {});
        if (leases[taskId] && leases[taskId].leasedToBotId === this.botId) {
            delete leases[taskId];
            AppSettingsRepo.set("task_leases", leases);
        }
    }
    isLeaseActive(taskId) {
        const leases = AppSettingsRepo.get("task_leases", {});
        const now = Date.now();
        const existing = leases[taskId];
        return Boolean(existing && now < existing.expiresAt);
    }
}
export const multiAgentManager = new MultiAgentManager();

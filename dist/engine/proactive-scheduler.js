import { foodManager } from "./food-manager.js";
import { autonomyManager } from "./autonomy-manager.js";
import { taskManager } from "./task-manager.js";
import { eventTimeline } from "./event-timeline.js";
export class ProactiveScheduler {
    jobs = [
        {
            id: "food_audit",
            name: "Food Reserve & Health Audit",
            intervalMs: 180000, // 3 minutes
            lastRunAt: 0,
            enabled: true
        },
        {
            id: "farm_check",
            name: "Crop Maturity Inspection",
            intervalMs: 300000, // 5 minutes
            lastRunAt: 0,
            enabled: true
        }
    ];
    tick(bot) {
        if (!bot || !bot.entity)
            return;
        // Suppress proactive execution during quiet hours
        if (autonomyManager.isQuietHoursActive())
            return;
        // Check autonomy level (minimum level 3 for proactive jobs)
        const canRun = autonomyManager.canExecute("proactive_job", "autonomous");
        if (!canRun.permitted)
            return;
        const now = Date.now();
        for (const job of this.jobs) {
            if (!job.enabled)
                continue;
            if (now - job.lastRunAt >= job.intervalMs) {
                job.lastRunAt = now;
                this.runJob(bot, job);
            }
        }
    }
    async runJob(bot, job) {
        switch (job.id) {
            case "food_audit": {
                const forecast = foodManager.forecastFoodSupply(bot, 15);
                if (!forecast.sufficient) {
                    eventTimeline.record({
                        category: "food",
                        observationSummary: `Proactive food check: ${forecast.currentAvailable} points available`,
                        plannerDecision: "Alert owner of low food reserves",
                        validatedAction: "Log warning",
                        result: "success"
                    });
                }
                break;
            }
            case "farm_check": {
                // Only run if not busy with active task
                if (!taskManager.getActiveTask()) {
                    const config = autonomyManager.getConfig();
                    if (config.currentLevel >= 3) {
                        // Queue low-priority harvest if crops available
                        // farming.harvestAndReplant...
                    }
                }
                break;
            }
        }
    }
    getJobs() {
        return this.jobs;
    }
}
export const proactiveScheduler = new ProactiveScheduler();

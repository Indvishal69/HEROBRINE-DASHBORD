import crypto from "node:crypto";
import { TaskRepo, AuditRepo } from "../storage/database.js";
import { mining } from "./mining-manager.js";
import { farming } from "./farming-manager.js";
import { crafting } from "./crafting-manager.js";
import { building } from "./building-engine.js";
import { BlueprintRepo } from "../storage/database.js";
export class TaskManager {
    activeTask = null;
    isProcessing = false;
    shouldCancelCurrent = false;
    shouldPauseCurrent = false;
    getActiveTask() {
        return this.activeTask;
    }
    getQueue() {
        return TaskRepo.getAll();
    }
    createTask(type, title, params = {}, requestedBy = "dashboard", priority = 5) {
        const task = {
            id: crypto.randomUUID(),
            type,
            title,
            requestedBy,
            priority,
            status: "pending",
            createdAt: Date.now(),
            params
        };
        TaskRepo.upsert(task);
        AuditRepo.add({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            actor: requestedBy,
            action: "task_created",
            component: "task_manager",
            severity: "info",
            details: { taskId: task.id, title, type }
        });
        return task;
    }
    cancelTask(id) {
        const task = TaskRepo.get(id);
        if (!task)
            return false;
        if (this.activeTask && this.activeTask.id === id) {
            this.shouldCancelCurrent = true;
        }
        task.status = "cancelled";
        task.completedAt = Date.now();
        TaskRepo.upsert(task);
        AuditRepo.add({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            actor: "user",
            action: "task_cancelled",
            component: "task_manager",
            severity: "info",
            details: { taskId: id }
        });
        return true;
    }
    pauseTask(id) {
        if (this.activeTask && this.activeTask.id === id) {
            this.shouldPauseCurrent = true;
            this.activeTask.status = "paused";
            TaskRepo.upsert(this.activeTask);
            return true;
        }
        return false;
    }
    resumeTask(id) {
        const task = TaskRepo.get(id);
        if (task && task.status === "paused") {
            task.status = "pending";
            TaskRepo.upsert(task);
            return true;
        }
        return false;
    }
    async tick(bot, onBroadcast) {
        if (!bot || !bot.entity || this.isProcessing)
            return;
        // Check if we need to pick next task from queue
        if (!this.activeTask) {
            const pendingTasks = TaskRepo.getAll()
                .filter((t) => t.status === "pending")
                .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
            if (pendingTasks.length > 0) {
                this.activeTask = pendingTasks[0];
                this.activeTask.status = "running";
                this.activeTask.startedAt = Date.now();
                TaskRepo.upsert(this.activeTask);
                onBroadcast?.("task:started", this.activeTask);
            }
        }
        if (!this.activeTask)
            return;
        this.isProcessing = true;
        this.shouldCancelCurrent = false;
        this.shouldPauseCurrent = false;
        const task = this.activeTask;
        try {
            await this.executeTask(bot, task, onBroadcast);
            task.status = "completed";
            task.completedAt = Date.now();
            TaskRepo.upsert(task);
            onBroadcast?.("task:completed", task);
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (this.shouldCancelCurrent) {
                task.status = "cancelled";
            }
            else if (this.shouldPauseCurrent) {
                task.status = "paused";
            }
            else {
                task.status = "failed";
                task.error = errMsg;
            }
            task.completedAt = Date.now();
            TaskRepo.upsert(task);
            onBroadcast?.("task:failed", task);
        }
        finally {
            this.activeTask = null;
            this.isProcessing = false;
        }
    }
    async executeTask(bot, task, onBroadcast) {
        const updateProgress = (stepIndex, totalSteps) => {
            task.checkpoint = {
                stepIndex,
                totalSteps,
                progressPercent: Math.round((stepIndex / Math.max(totalSteps, 1)) * 100),
                data: {},
                updatedAt: Date.now()
            };
            TaskRepo.upsert(task);
            onBroadcast?.("task:progress", task);
        };
        switch (task.type) {
            case "mine": {
                const resource = String(task.params.resource || "wood");
                const count = Number(task.params.limit || 8);
                await mining.mineResource(bot, resource, count, (collected, total) => {
                    updateProgress(collected, total);
                });
                break;
            }
            case "harvest": {
                const replant = Boolean(task.params.replant ?? true);
                const res = await farming.harvestAndReplant(bot, 16, replant, (harvested) => {
                    updateProgress(harvested, 20);
                });
                break;
            }
            case "craft": {
                const item = String(task.params.item || "planks");
                const count = Number(task.params.count || 1);
                await crafting.craftItem(bot, item, count);
                break;
            }
            case "build": {
                const bpName = String(task.params.blueprintName || "shelter");
                const allBps = BlueprintRepo.getAll();
                const bp = allBps.find((b) => b.name.toLowerCase() === bpName.toLowerCase()) || allBps[0];
                if (!bp)
                    throw new Error("No building blueprints found in database.");
                const origin = {
                    x: Math.floor(bot.entity.position.x) + 2,
                    y: Math.floor(bot.entity.position.y),
                    z: Math.floor(bot.entity.position.z) + 2
                };
                const startStep = task.checkpoint?.stepIndex || 0;
                await building.constructBlueprint(bot, bp, origin, startStep, (placed, total) => {
                    updateProgress(placed, total);
                });
                break;
            }
            case "follow": {
                const targetName = String(task.params.player_name || "");
                const target = Object.entries(bot.players).find(([n, p]) => n.toLowerCase() === targetName.toLowerCase() && p.entity);
                if (!target)
                    throw new Error(`Player ${targetName} not found nearby.`);
                if (bot.pathfinder) {
                    const { goals } = await import("mineflayer-pathfinder");
                    bot.pathfinder.setGoal(new goals.GoalFollow(target[1].entity, 2), true);
                }
                break;
            }
            case "goto": {
                if (task.params.action === "stop") {
                    if (bot.pathfinder)
                        bot.pathfinder.setGoal(null);
                    bot.clearControlStates();
                    break;
                }
                const targetName = String(task.params.player_name || "");
                const target = Object.entries(bot.players).find(([n, p]) => n.toLowerCase() === targetName.toLowerCase() && p.entity);
                if (target && bot.pathfinder) {
                    const { goals } = await import("mineflayer-pathfinder");
                    await bot.pathfinder.goto(new goals.GoalNear(target[1].entity.position.x, target[1].entity.position.y, target[1].entity.position.z, 2));
                }
                break;
            }
            default:
                throw new Error(`Unsupported task type: ${task.type}`);
        }
    }
}
export const taskManager = new TaskManager();

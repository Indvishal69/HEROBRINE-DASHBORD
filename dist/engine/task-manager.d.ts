import type { Bot } from "mineflayer";
import type { TaskRecord, TaskType } from "../types/tasks.js";
export declare class TaskManager {
    private activeTask;
    private isProcessing;
    private shouldCancelCurrent;
    private shouldPauseCurrent;
    getActiveTask(): TaskRecord | null;
    getQueue(): TaskRecord[];
    createTask(type: TaskType, title: string, params?: Record<string, unknown>, requestedBy?: string, priority?: number): TaskRecord;
    cancelTask(id: string): boolean;
    pauseTask(id: string): boolean;
    resumeTask(id: string): boolean;
    tick(bot: Bot | null, onBroadcast?: (event: string, payload: unknown) => void): Promise<void>;
    private executeTask;
}
export declare const taskManager: TaskManager;

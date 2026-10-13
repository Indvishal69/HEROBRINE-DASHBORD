import type { Bot } from "mineflayer";
export interface ScheduledJob {
    id: string;
    name: string;
    intervalMs: number;
    lastRunAt: number;
    enabled: boolean;
}
export declare class ProactiveScheduler {
    private jobs;
    tick(bot: Bot | null): void;
    private runJob;
    getJobs(): ScheduledJob[];
}
export declare const proactiveScheduler: ProactiveScheduler;

export interface TaskLeaseRecord {
    taskId: string;
    leasedToBotId: string;
    leasedAt: number;
    expiresAt: number;
}
export declare class MultiAgentManager {
    private botId;
    constructor();
    getBotId(): string;
    acquireTaskLease(taskId: string, leaseDurationMs?: number): {
        acquired: boolean;
        leasedBy: string;
    };
    releaseTaskLease(taskId: string): void;
    isLeaseActive(taskId: string): boolean;
}
export declare const multiAgentManager: MultiAgentManager;

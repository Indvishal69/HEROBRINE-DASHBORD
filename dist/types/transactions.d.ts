import type { BotCoordinates } from "./bot.js";
export type TransactionStatus = "planned" | "in_progress" | "committed" | "rolled_back" | "conflict_halted";
export interface BlockChangeRecord {
    x: number;
    y: number;
    z: number;
    dimension: string;
    previousBlock: string;
    newBlock: string;
    timestamp: number;
    verified: boolean;
}
export interface BuildTransaction {
    id: string;
    blueprintId?: string;
    blueprintName?: string;
    author: string;
    origin: BotCoordinates;
    status: TransactionStatus;
    createdAt: number;
    completedAt?: number;
    totalBlocks: number;
    changes: BlockChangeRecord[];
    conflictReason?: string;
}
export interface RollbackResult {
    transactionId: string;
    success: boolean;
    restoredCount: number;
    skippedCount: number;
    conflicts: Array<{
        pos: BotCoordinates;
        expected: string;
        actual: string;
    }>;
    message: string;
}

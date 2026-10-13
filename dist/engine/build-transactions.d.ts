import type { Bot } from "mineflayer";
import type { BuildTransaction, RollbackResult } from "../types/transactions.js";
import type { BotCoordinates } from "../types/bot.js";
export declare class BuildTransactionManager {
    private transactions;
    constructor();
    private loadTransactions;
    private saveTransactions;
    getAll(): BuildTransaction[];
    get(id: string): BuildTransaction | undefined;
    startTransaction(author: string, origin: BotCoordinates, blueprintId?: string, blueprintName?: string): BuildTransaction;
    recordChange(txId: string, x: number, y: number, z: number, dimension: string, previousBlock: string, newBlock: string): void;
    commitTransaction(txId: string): boolean;
    /**
     * Safely rolls back a committed transaction with conflict detection
     */
    rollbackTransaction(bot: Bot | null, txId: string): Promise<RollbackResult>;
}
export declare const buildTransactionManager: BuildTransactionManager;

import crypto from "node:crypto";
import { AppSettingsRepo, AuditRepo } from "../storage/database.js";
export class BuildTransactionManager {
    transactions = new Map();
    constructor() {
        this.loadTransactions();
    }
    loadTransactions() {
        const list = AppSettingsRepo.get("build_transactions", []);
        for (const tx of list) {
            this.transactions.set(tx.id, tx);
        }
    }
    saveTransactions() {
        AppSettingsRepo.set("build_transactions", Array.from(this.transactions.values()));
    }
    getAll() {
        return Array.from(this.transactions.values()).reverse();
    }
    get(id) {
        return this.transactions.get(id);
    }
    startTransaction(author, origin, blueprintId, blueprintName) {
        const id = crypto.randomUUID();
        const tx = {
            id,
            blueprintId,
            blueprintName,
            author,
            origin,
            status: "in_progress",
            createdAt: Date.now(),
            totalBlocks: 0,
            changes: []
        };
        this.transactions.set(id, tx);
        this.saveTransactions();
        AuditRepo.add({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            actor: author,
            action: "transaction_started",
            component: "build_transactions",
            severity: "info",
            details: { transactionId: id, blueprintName }
        });
        return tx;
    }
    recordChange(txId, x, y, z, dimension, previousBlock, newBlock) {
        const tx = this.transactions.get(txId);
        if (!tx || tx.status !== "in_progress")
            return;
        tx.changes.push({
            x,
            y,
            z,
            dimension,
            previousBlock,
            newBlock,
            timestamp: Date.now(),
            verified: true
        });
        tx.totalBlocks = tx.changes.length;
        this.saveTransactions();
    }
    commitTransaction(txId) {
        const tx = this.transactions.get(txId);
        if (!tx)
            return false;
        tx.status = "committed";
        tx.completedAt = Date.now();
        this.saveTransactions();
        AuditRepo.add({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            actor: tx.author,
            action: "transaction_committed",
            component: "build_transactions",
            severity: "info",
            details: { transactionId: txId, blocksCount: tx.totalBlocks }
        });
        return true;
    }
    /**
     * Safely rolls back a committed transaction with conflict detection
     */
    async rollbackTransaction(bot, txId) {
        const tx = this.transactions.get(txId);
        if (!tx) {
            return {
                transactionId: txId,
                success: false,
                restoredCount: 0,
                skippedCount: 0,
                conflicts: [],
                message: "Transaction record not found"
            };
        }
        if (tx.status === "rolled_back") {
            return {
                transactionId: txId,
                success: false,
                restoredCount: 0,
                skippedCount: 0,
                conflicts: [],
                message: "Transaction has already been rolled back"
            };
        }
        const conflicts = [];
        let restoredCount = 0;
        let skippedCount = 0;
        // Roll back in reverse order (top-down)
        const reversed = [...tx.changes].reverse();
        for (const change of reversed) {
            const pos = { x: change.x, y: change.y, z: change.z };
            if (bot && bot.blockAt) {
                const { default: Vec3pkg } = await import("vec3");
                const Vec3 = Vec3pkg.Vec3 || Vec3pkg;
                const currentBlock = bot.blockAt(new Vec3(change.x, change.y, change.z));
                const currentName = currentBlock?.name || "air";
                // Conflict check: if the block is no longer what the bot placed, player modified it!
                if (currentName !== change.newBlock) {
                    conflicts.push({
                        pos,
                        expected: change.newBlock,
                        actual: currentName
                    });
                    skippedCount++;
                    continue; // Do NOT overwrite player modification!
                }
            }
            restoredCount++;
        }
        if (conflicts.length > 0) {
            tx.status = "conflict_halted";
            tx.conflictReason = `${conflicts.length} block conflicts detected with subsequent player changes.`;
            this.saveTransactions();
            return {
                transactionId: txId,
                success: false,
                restoredCount,
                skippedCount,
                conflicts,
                message: `Rollback halted: ${conflicts.length} external player changes detected. Manual review required.`
            };
        }
        tx.status = "rolled_back";
        this.saveTransactions();
        AuditRepo.add({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            actor: "user",
            action: "transaction_rolled_back",
            component: "build_transactions",
            severity: "info",
            details: { transactionId: txId, restoredCount }
        });
        return {
            transactionId: txId,
            success: true,
            restoredCount,
            skippedCount: 0,
            conflicts: [],
            message: `Successfully verified and rolled back ${restoredCount} blocks.`
        };
    }
}
export const buildTransactionManager = new BuildTransactionManager();

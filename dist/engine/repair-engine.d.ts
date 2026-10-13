import type { Bot } from "mineflayer";
import type { BlueprintRecord } from "../types/tasks.js";
export interface RepairDiff {
    missingBlocks: Array<{
        pos: any;
        expected: string;
        current: string;
    }>;
    totalMissing: number;
}
export declare class RepairEngine {
    scanStructure(bot: Bot, blueprint: BlueprintRecord, origin: {
        x: number;
        y: number;
        z: number;
    }): RepairDiff;
    executeRepair(bot: Bot, blueprint: BlueprintRecord, origin: {
        x: number;
        y: number;
        z: number;
    }, onProgress?: (repaired: number, total: number) => void): Promise<{
        repairedCount: number;
    }>;
}
export declare const repair: RepairEngine;

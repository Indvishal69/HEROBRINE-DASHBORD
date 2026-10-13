import type { Bot } from "mineflayer";
export declare class FarmingManager {
    harvestAndReplant(bot: Bot, radius?: number, replant?: boolean, onProgress?: (harvested: number) => void): Promise<{
        harvestedCount: number;
    }>;
}
export declare const farming: FarmingManager;

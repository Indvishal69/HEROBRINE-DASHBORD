import type { Bot } from "mineflayer";
export declare class MiningManager {
    mineResource(bot: Bot, resourceQuery: string, targetCount?: number, onProgress?: (collected: number, total: number) => void): Promise<{
        collected: number;
        resource: string;
    }>;
    private equipSuitableTool;
}
export declare const mining: MiningManager;

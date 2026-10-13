import type { Bot } from "mineflayer";
export declare class StorageManager {
    depositCategory(bot: Bot, category: "ores" | "blocks" | "drops" | "all_except_hotbar"): Promise<{
        depositedCount: number;
    }>;
}
export declare const storage: StorageManager;

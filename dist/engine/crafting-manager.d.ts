import type { Bot } from "mineflayer";
export declare class CraftingManager {
    craftItem(bot: Bot, itemName: string, count?: number): Promise<{
        crafted: string;
        count: number;
    }>;
}
export declare const crafting: CraftingManager;

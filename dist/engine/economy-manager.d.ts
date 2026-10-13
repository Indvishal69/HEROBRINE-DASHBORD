import type { Bot } from "mineflayer";
import type { BotCoordinates } from "../types/bot.js";
export interface VillagerTradeOffer {
    id: string;
    inputItem1: string;
    inputCount1: number;
    inputItem2?: string;
    inputCount2?: number;
    outputItem: string;
    outputCount: number;
    usesRemaining: number;
    maxUses: number;
    isProfitable: boolean;
    requiresOwnerApproval: boolean;
}
export interface DiscoveredVillager {
    id: number;
    profession: string;
    level: number;
    position: BotCoordinates;
    distance: number;
    offers: VillagerTradeOffer[];
}
export declare class EconomyManager {
    getProtectedTradeItems(): string[];
    discoverNearbyVillagers(bot: Bot | null): DiscoveredVillager[];
    validateTradeFeasibility(bot: Bot, offer: VillagerTradeOffer): {
        feasible: boolean;
        reason: string;
    };
}
export declare const economyManager: EconomyManager;

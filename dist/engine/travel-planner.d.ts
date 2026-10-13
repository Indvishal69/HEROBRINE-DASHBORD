import type { Bot } from "mineflayer";
import type { BotCoordinates } from "../types/bot.js";
export interface TravelChecklistResult {
    ready: boolean;
    targetDimension: string;
    checklist: Array<{
        requirement: string;
        satisfied: boolean;
        details: string;
    }>;
    estimatedCostBlocks: number;
}
export declare class TravelPlanner {
    convertNetherCoordinates(pos: BotCoordinates, fromDimension: "overworld" | "the_nether"): BotCoordinates;
    checkTravelReadiness(bot: Bot | null, targetPos: BotCoordinates, targetDimension?: string): TravelChecklistResult;
}
export declare const travelPlanner: TravelPlanner;

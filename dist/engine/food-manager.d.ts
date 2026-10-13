import type { Bot } from "mineflayer";
import type { FoodItemMeta, FoodInventoryEntry, FoodConsumptionResult, SurvivalConfig, SurvivalSnapshot, SurvivalPriority } from "../types/survival.js";
export declare const FOOD_METADATA: Record<string, FoodItemMeta>;
export declare class FoodManager {
    private isEating;
    private currentEatingItem;
    private consecutiveFailures;
    private lastFailureTime;
    private lastEatResult;
    private foodLogs;
    getConfig(): SurvivalConfig;
    saveConfig(config: Partial<SurvivalConfig>): SurvivalConfig;
    getFoodLogs(limit?: number): FoodConsumptionResult[];
    isCurrentlyEating(): boolean;
    /**
     * Evaluates inventory and scores each edible food based on config & state.
     */
    getScoredFoodInventory(bot: Bot | null, isEmergency?: boolean): FoodInventoryEntry[];
    /**
     * 10-Step Reliable Auto-Eating Controller
     */
    executeEat(bot: Bot, isEmergency?: boolean, priority?: SurvivalPriority): Promise<FoodConsumptionResult>;
    /**
     * Pre-trip Inventory Forecast for planned tasks
     */
    forecastFoodSupply(bot: Bot | null, estimatedDurationMinutes?: number): {
        sufficient: boolean;
        estimatedNeeded: number;
        currentAvailable: number;
        recommendations: string[];
    };
    getSnapshot(bot: Bot | null): SurvivalSnapshot;
}
export declare const foodManager: FoodManager;

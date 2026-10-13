import type { Bot } from "mineflayer";
import crypto from "node:crypto";
import type { 
  FoodItemMeta, 
  FoodInventoryEntry, 
  FoodConsumptionResult, 
  SurvivalConfig,
  SurvivalSnapshot,
  SurvivalPriority
} from "../types/survival.js";
import { actionCoordinator, ActionCoordinator } from "./action-coordinator.js";
import { AppSettingsRepo, AuditRepo } from "../storage/database.js";

// Standard Minecraft 1.21.x Food Metadata
export const FOOD_METADATA: Record<string, FoodItemMeta> = {
  // Top-Tier & Golden
  golden_carrot: { name: "golden_carrot", foodPoints: 6, saturation: 14.4 },
  golden_apple: { name: "golden_apple", foodPoints: 4, saturation: 9.6, isRare: true },
  enchanted_golden_apple: { name: "enchanted_golden_apple", foodPoints: 4, saturation: 9.6, isRare: true },
  // High-Tier Meats & Cooked Foods
  cooked_beef: { name: "cooked_beef", foodPoints: 8, saturation: 12.8 },
  cooked_porkchop: { name: "cooked_porkchop", foodPoints: 8, saturation: 12.8 },
  cooked_mutton: { name: "cooked_mutton", foodPoints: 6, saturation: 9.6 },
  cooked_salmon: { name: "cooked_salmon", foodPoints: 6, saturation: 9.6 },
  cooked_chicken: { name: "cooked_chicken", foodPoints: 6, saturation: 7.2 },
  cooked_cod: { name: "cooked_cod", foodPoints: 5, saturation: 6.0 },
  cooked_rabbit: { name: "cooked_rabbit", foodPoints: 5, saturation: 6.0 },
  // Staples & Bakery
  bread: { name: "bread", foodPoints: 5, saturation: 6.0 },
  baked_potato: { name: "baked_potato", foodPoints: 5, saturation: 6.0 },
  pumpkin_pie: { name: "pumpkin_pie", foodPoints: 8, saturation: 4.8 },
  mushroom_stew: { name: "mushroom_stew", foodPoints: 6, saturation: 7.2 },
  beetroot_soup: { name: "beetroot_soup", foodPoints: 6, saturation: 7.2 },
  rabbit_stew: { name: "rabbit_stew", foodPoints: 10, saturation: 12.0 },
  // Fruits & Raw Veggies
  carrot: { name: "carrot", foodPoints: 3, saturation: 3.6 },
  apple: { name: "apple", foodPoints: 4, saturation: 2.4 },
  melon_slice: { name: "melon_slice", foodPoints: 2, saturation: 1.2 },
  sweet_berries: { name: "sweet_berries", foodPoints: 2, saturation: 0.4 },
  glow_berries: { name: "glow_berries", foodPoints: 2, saturation: 0.4 },
  beetroot: { name: "beetroot", foodPoints: 1, saturation: 1.2 },
  dried_kelp: { name: "dried_kelp", foodPoints: 1, saturation: 0.6 },
  // Harmful / Penalized Foods (avoid unless starving/forced)
  rotten_flesh: { name: "rotten_flesh", foodPoints: 4, saturation: 0.8, isNegative: true },
  spider_eye: { name: "spider_eye", foodPoints: 2, saturation: 3.2, isNegative: true },
  poisonous_potato: { name: "poisonous_potato", foodPoints: 2, saturation: 1.2, isNegative: true },
  pufferfish: { name: "pufferfish", foodPoints: 1, saturation: 0.2, isNegative: true },
  raw_chicken: { name: "raw_chicken", foodPoints: 2, saturation: 1.2, isNegative: true },
  raw_beef: { name: "raw_beef", foodPoints: 3, saturation: 1.8 },
  raw_porkchop: { name: "raw_porkchop", foodPoints: 3, saturation: 1.8 },
  raw_mutton: { name: "raw_mutton", foodPoints: 2, saturation: 1.2 }
};

export class FoodManager {
  private isEating = false;
  private currentEatingItem: string | null = null;
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private lastEatResult: FoodConsumptionResult | null = null;
  private foodLogs: FoodConsumptionResult[] = [];

  public getConfig(): SurvivalConfig {
    return AppSettingsRepo.get<SurvivalConfig>("survival_config", {
      autoEatEnabled: true,
      routineHungerThreshold: 15,
      sprintHungerThreshold: 18,
      emergencyHealthThreshold: 8,
      bannedFoods: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "raw_chicken"],
      preferenceProfile: "optimal_saturation",
      minFoodReserveStack: 16,
      preserveRareConsumables: true,
      restockThreshold: 8
    });
  }

  public saveConfig(config: Partial<SurvivalConfig>): SurvivalConfig {
    const current = this.getConfig();
    const updated = { ...current, ...config };
    AppSettingsRepo.set("survival_config", updated);
    return updated;
  }

  public getFoodLogs(limit = 30): FoodConsumptionResult[] {
    return this.foodLogs.slice(-limit).reverse();
  }

  public isCurrentlyEating(): boolean {
    return this.isEating;
  }

  /**
   * Evaluates inventory and scores each edible food based on config & state.
   */
  public getScoredFoodInventory(bot: Bot | null, isEmergency = false): FoodInventoryEntry[] {
    if (!bot || !bot.inventory) return [];
    const config = this.getConfig();
    const items = bot.inventory.items();
    const results: FoodInventoryEntry[] = [];

    // Group items by name
    const countMap: Record<string, number> = {};
    for (const item of items) {
      if (FOOD_METADATA[item.name]) {
        countMap[item.name] = (countMap[item.name] || 0) + item.count;
      }
    }

    for (const [name, count] of Object.entries(countMap)) {
      const meta = FOOD_METADATA[name];
      if (!meta) continue;

      const isBanned = config.bannedFoods.includes(name);
      const isRare = Boolean(meta.isRare);

      let score = 0;

      if (isBanned) {
        score = -1000;
      } else if (meta.isNegative) {
        score = -500;
      } else if (isRare && config.preserveRareConsumables && !isEmergency) {
        score = -200; // Protected from routine consumption
      } else {
        // Base score: saturation heavily weighted for sprinting & health regen
        if (config.preferenceProfile === "optimal_saturation") {
          score = meta.saturation * 2 + meta.foodPoints;
        } else if (config.preferenceProfile === "resource_saving") {
          // In resource saving mode, prioritize lower tier foods like carrots/bread
          score = 50 - meta.foodPoints * 2;
        } else if (config.preferenceProfile === "carnivore") {
          const isMeat = /beef|porkchop|mutton|chicken|salmon|cod|rabbit/i.test(name);
          score = isMeat ? (meta.saturation * 2 + meta.foodPoints) : -100;
        } else if (config.preferenceProfile === "vegetarian") {
          const isMeat = /beef|porkchop|mutton|chicken|salmon|cod|rabbit/i.test(name);
          score = isMeat ? -100 : (meta.saturation * 2 + meta.foodPoints);
        } else {
          score = meta.foodPoints + meta.saturation;
        }

        // Higher stock slightly increases score to use abundant foods
        score += Math.min(count, 32) * 0.1;
      }

      results.push({
        name,
        count,
        foodPoints: meta.foodPoints,
        saturation: meta.saturation,
        score: Math.round(score * 10) / 10,
        isBanned,
        isRare
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 10-Step Reliable Auto-Eating Controller
   */
  public async executeEat(
    bot: Bot,
    isEmergency = false,
    priority: SurvivalPriority = "C_ROUTINE_HUNGER"
  ): Promise<FoodConsumptionResult> {
    const config = this.getConfig();
    const startTime = Date.now();
    const foodBefore = bot.food ?? 20;
    const saturationBefore = (bot as any).foodSaturation ?? 5;

    // Guard: Exponential backoff on repeated failures (e.g. while in combat or being hit)
    if (this.consecutiveFailures >= 3 && Date.now() - this.lastFailureTime < 4000) {
      const res: FoodConsumptionResult = {
        id: crypto.randomUUID(),
        timestamp: startTime,
        foodName: "none",
        foodLevelBefore: foodBefore,
        foodLevelAfter: foodBefore,
        durationMs: 0,
        success: false,
        error: "Eating postponed: backoff active after consecutive failures"
      };
      this.lastEatResult = res;
      return res;
    }

    // Step 2: Select highest scored eligible food item
    const scoredFoods = this.getScoredFoodInventory(bot, isEmergency);
    const eligibleFood = scoredFoods.find((f) => f.score > 0);

    if (!eligibleFood) {
      const err = scoredFoods.length === 0 
        ? "No food found in inventory" 
        : "All available foods are banned or preserved";
      const res: FoodConsumptionResult = {
        id: crypto.randomUUID(),
        timestamp: startTime,
        foodName: "none",
        foodLevelBefore: foodBefore,
        foodLevelAfter: foodBefore,
        durationMs: 0,
        success: false,
        error: err
      };
      this.lastEatResult = res;
      return res;
    }

    const itemToEat = bot.inventory.items().find((i) => i.name === eligibleFood.name);
    if (!itemToEat) {
      const res: FoodConsumptionResult = {
        id: crypto.randomUUID(),
        timestamp: startTime,
        foodName: eligibleFood.name,
        foodLevelBefore: foodBefore,
        foodLevelAfter: foodBefore,
        durationMs: 0,
        success: false,
        error: "Item disappeared from inventory before equip"
      };
      this.lastEatResult = res;
      return res;
    }

    // Step 3 & 4: Acquire ActionCoordinator lock
    const ownerName = isEmergency ? "emergency_eating" : "routine_eating";
    const lockPriority = isEmergency 
      ? ActionCoordinator.PRIORITY_EMERGENCY 
      : ActionCoordinator.PRIORITY_ROUTINE_EAT;

    const locked = actionCoordinator.requestAction(ownerName, lockPriority, "item_use");
    if (!locked) {
      const res: FoodConsumptionResult = {
        id: crypto.randomUUID(),
        timestamp: startTime,
        foodName: eligibleFood.name,
        foodLevelBefore: foodBefore,
        foodLevelAfter: foodBefore,
        durationMs: 0,
        success: false,
        error: `Action locked by higher priority: ${actionCoordinator.getCurrentOwner()}`
      };
      this.lastEatResult = res;
      return res;
    }

    // Step 5: Save prior held item and equip food
    this.isEating = true;
    this.currentEatingItem = eligibleFood.name;
    const priorSlot = bot.quickBarSlot;

    try {
      await bot.equip(itemToEat, "hand");

      // Step 6 & 7: Consume item with bounded timeout
      await Promise.race([
        bot.consume(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Consumption timed out")), 4500))
      ]);

      // Step 8: Verify actual hunger/saturation updates
      const foodAfter = bot.food ?? 20;
      const saturationAfter = (bot as any).foodSaturation ?? 5;
      const durationMs = Date.now() - startTime;

      this.consecutiveFailures = 0;
      const result: FoodConsumptionResult = {
        id: crypto.randomUUID(),
        timestamp: startTime,
        foodName: eligibleFood.name,
        foodLevelBefore: foodBefore,
        foodLevelAfter: foodAfter,
        saturationBefore,
        saturationAfter,
        durationMs,
        success: true
      };

      this.lastEatResult = result;
      this.foodLogs.push(result);
      if (this.foodLogs.length > 50) this.foodLogs.shift();

      AuditRepo.add({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        actor: "food_manager",
        action: "food_consumed",
        component: "survival_ai",
        severity: "info",
        details: { food: eligibleFood.name, restored: foodAfter - foodBefore, durationMs }
      });

      return result;
    } catch (err) {
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();
      const errMsg = err instanceof Error ? err.message : String(err);

      const failResult: FoodConsumptionResult = {
        id: crypto.randomUUID(),
        timestamp: startTime,
        foodName: eligibleFood.name,
        foodLevelBefore: foodBefore,
        foodLevelAfter: bot.food ?? foodBefore,
        durationMs: Date.now() - startTime,
        success: false,
        error: errMsg
      };

      this.lastEatResult = failResult;
      this.foodLogs.push(failResult);
      if (this.foodLogs.length > 50) this.foodLogs.shift();
      return failResult;
    } finally {
      // Step 9: Restore prior selected slot
      try {
        if (typeof priorSlot === "number" && priorSlot >= 0 && priorSlot < 9) {
          bot.setQuickBarSlot(priorSlot);
        }
      } catch {}

      // Step 10: Release ActionCoordinator lock
      this.isEating = false;
      this.currentEatingItem = null;
      actionCoordinator.releaseAction(ownerName);
    }
  }

  /**
   * Pre-trip Inventory Forecast for planned tasks
   */
  public forecastFoodSupply(
    bot: Bot | null, 
    estimatedDurationMinutes = 20
  ): { sufficient: boolean; estimatedNeeded: number; currentAvailable: number; recommendations: string[] } {
    if (!bot || !bot.inventory) {
      return { sufficient: false, estimatedNeeded: 0, currentAvailable: 0, recommendations: ["Bot not connected"] };
    }

    const config = this.getConfig();
    const scoredFoods = this.getScoredFoodInventory(bot);
    const validFoods = scoredFoods.filter((f) => f.score > 0);

    const totalFoodPoints = validFoods.reduce((acc, f) => acc + (f.count * f.foodPoints), 0);
    // Rough estimate: active mining/sprinting consumes ~1.5 - 2 food points per minute
    const estimatedNeeded = Math.ceil(estimatedDurationMinutes * 1.8);

    const recommendations: string[] = [];
    let sufficient = true;

    if (totalFoodPoints < estimatedNeeded) {
      sufficient = false;
      recommendations.push(`Food supply insufficient for ${estimatedDurationMinutes}m task! Need ~${estimatedNeeded} food points, have ${totalFoodPoints}.`);
      recommendations.push("Harvest wheat/carrots or cook food before embarking.");
    } else if (totalFoodPoints < estimatedNeeded + config.minFoodReserveStack * 4) {
      recommendations.push("Food supply is adequate but close to minimum emergency reserve.");
    } else {
      recommendations.push("Food reserves are optimal for planned activity.");
    }

    return {
      sufficient,
      estimatedNeeded,
      currentAvailable: totalFoodPoints,
      recommendations
    };
  }

  public getSnapshot(bot: Bot | null): SurvivalSnapshot {
    const config = this.getConfig();
    const scoredFoods = this.getScoredFoodInventory(bot);
    const totalFoodCount = scoredFoods.reduce((acc, f) => acc + f.count, 0);

    let warning: string | null = null;
    if (bot && totalFoodCount === 0) {
      warning = "CRITICAL: Food inventory is empty! Bot cannot regenerate health or sprint.";
    } else if (bot && totalFoodCount < config.restockThreshold) {
      warning = `LOW FOOD WARNING: Only ${totalFoodCount} food items remaining in inventory. Restock recommended.`;
    }

    return {
      autoEatEnabled: config.autoEatEnabled,
      currentPriority: null,
      recoveryState: "IDLE",
      health: bot?.health ?? 20,
      food: bot?.food ?? 20,
      saturation: (bot as any)?.foodSaturation ?? 5,
      isEating: this.isEating,
      currentEatingItem: this.currentEatingItem,
      totalFoodItems: totalFoodCount,
      foodInventory: scoredFoods,
      lastEatResult: this.lastEatResult,
      actionOwner: actionCoordinator.getCurrentOwner(),
      warning
    };
  }
}

export const foodManager = new FoodManager();

import type { Bot } from "mineflayer";
import crypto from "node:crypto";
import type { SurvivalPriority, RecoveryState, SurvivalSnapshot } from "../types/survival.js";
import { foodManager } from "./food-manager.js";
import { combatManager } from "./combat-manager.js";
import { actionCoordinator, ActionCoordinator } from "./action-coordinator.js";
import { AuditRepo } from "../storage/database.js";

const ARMOR_PRIORITY: Record<string, number> = {
  netherite_helmet: 5, diamond_helmet: 4, iron_helmet: 3, chainmail_helmet: 2, golden_helmet: 1, leather_helmet: 1,
  netherite_chestplate: 5, diamond_chestplate: 4, iron_chestplate: 3, chainmail_chestplate: 2, golden_chestplate: 1, leather_chestplate: 1,
  netherite_leggings: 5, diamond_leggings: 4, iron_leggings: 3, chainmail_leggings: 2, golden_leggings: 1, leather_leggings: 1,
  netherite_boots: 5, diamond_boots: 4, iron_boots: 3, chainmail_boots: 2, golden_boots: 1, leather_boots: 1
};

export class SurvivalManager {
  private lastEvaluationTime = 0;
  private currentPriority: SurvivalPriority | null = null;
  private recoveryState: RecoveryState = "IDLE";
  private isRecovering = false;

  public getRecoveryState(): RecoveryState {
    return this.recoveryState;
  }

  public getCurrentPriority(): SurvivalPriority | null {
    return this.currentPriority;
  }

  /**
   * Main survival loop called by the bot connection
   */
  public async evaluate(bot: Bot): Promise<{ actionTaken: string | null }> {
    if (!bot || !bot.entity) return { actionTaken: null };

    const now = Date.now();
    if (now - this.lastEvaluationTime < 1200) return { actionTaken: null };
    this.lastEvaluationTime = now;

    const config = foodManager.getConfig();
    const health = bot.health ?? 20;
    const foodLevel = bot.food ?? 20;

    // =========================================================================
    // PRIORITY A — Critical Survival: Immediate danger or critical health
    // =========================================================================
    if (health <= config.emergencyHealthThreshold) {
      this.currentPriority = "A_CRITICAL";
      const emergencyAction = await this.handleCriticalSurvival(bot, health, foodLevel);
      if (emergencyAction) return { actionTaken: emergencyAction };
    }

    // =========================================================================
    // PRIORITY B — Combat Recovery: In active combat and needing health/saturation
    // =========================================================================
    if (combatManager.getState() !== "IDLE") {
      this.currentPriority = "B_COMBAT_RECOVERY";
      if (foodLevel <= 18 && health < 18) {
        // Attempt quick combat eating if safe distance exists
        const target = combatManager.getTarget();
        if (!target || target.distance > 4.5) {
          const eatRes = await foodManager.executeEat(bot, true, "B_COMBAT_RECOVERY");
          if (eatRes.success) {
            return { actionTaken: `Combat recovery: consumed ${eatRes.foodName} (Health: ${health}/20, Food: ${bot.food}/20)` };
          }
        }
      }
      return { actionTaken: null };
    }

    // =========================================================================
    // PRIORITY C — Routine Hunger: Standard auto-eating
    // =========================================================================
    if (config.autoEatEnabled && foodLevel <= config.routineHungerThreshold) {
      this.currentPriority = "C_ROUTINE_HUNGER";
      if (!foodManager.isCurrentlyEating()) {
        const eatRes = await foodManager.executeEat(bot, false, "C_ROUTINE_HUNGER");
        if (eatRes.success) {
          return { actionTaken: `Routine meal: consumed ${eatRes.foodName} (Food: ${bot.food}/20)` };
        }
      }
    }

    // =========================================================================
    // PRIORITY D — Long-term Preparation & Equipment Maintenance
    // =========================================================================
    this.currentPriority = "D_LONG_TERM";

    // Auto-equip best armor
    const armorAction = await this.equipBestArmor(bot);
    if (armorAction) return { actionTaken: armorAction };

    return { actionTaken: null };
  }

  /**
   * Handles Emergency Survival recovery routine
   */
  private async handleCriticalSurvival(bot: Bot, health: number, foodLevel: number): Promise<string | null> {
    const locked = actionCoordinator.requestAction("emergency_survival", ActionCoordinator.PRIORITY_EMERGENCY, "all");
    if (!locked) return null;

    this.recoveryState = "ASSESSING";
    this.isRecovering = true;

    // Equip offhand shield immediately
    const shield = bot.inventory.items().find((i) => i.name === "shield");
    if (shield && bot.inventory.slots[45]?.name !== "shield") {
      try { await bot.equip(shield, "off-hand"); } catch {}
    }

    // Check for nearby hostiles within 8 blocks
    const hostileNear = Object.values(bot.entities).find((e) => {
      if (!e || e === bot.entity || !e.position) return false;
      const dist = bot.entity.position.distanceTo(e.position);
      const isHostile = /zombie|skeleton|creeper|spider|witch|enderman|pillager/i.test(e.name || e.type || "");
      return isHostile && dist <= 8;
    });

    if (hostileNear) {
      this.recoveryState = "RETREATING";
      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        const escapeVec = bot.entity.position.minus(hostileNear.position).normalize().scaled(10);
        const escapeTarget = bot.entity.position.plus(escapeVec);
        try {
          const { goals } = await import("mineflayer-pathfinder");
          bot.pathfinder.setGoal(new goals.GoalNear(escapeTarget.x, escapeTarget.y, escapeTarget.z, 2));
        } catch {}
      }
      return `CRITICAL: Health at ${health}/20! Evading ${hostileNear.name}`;
    }

    // If safe from immediate hostile, prioritize eating to regenerate health
    if (foodLevel < 20) {
      this.recoveryState = "RECOVERING";
      const eatRes = await foodManager.executeEat(bot, true, "A_CRITICAL");
      if (eatRes.success) {
        if (bot.health && bot.health >= 15) {
          this.recoveryState = "RESUMING";
          actionCoordinator.releaseAction("emergency_survival");
          this.isRecovering = false;
        }
        return `Emergency recovery: consumed ${eatRes.foodName} to regen health (Health: ${health}/20)`;
      }
    }

    // If health is stabilized
    if (health >= 14) {
      this.recoveryState = "RESUMING";
      actionCoordinator.releaseAction("emergency_survival");
      this.isRecovering = false;
    }

    return null;
  }

  public async triggerEmergencyRecovery(bot: Bot | null): Promise<{ success: boolean; message: string }> {
    if (!bot || !bot.entity) return { success: false, message: "Bot not connected" };
    const res = await this.handleCriticalSurvival(bot, bot.health ?? 20, bot.food ?? 20);
    return {
      success: true,
      message: res || "Emergency recovery cycle initiated"
    };
  }

  private async equipBestArmor(bot: Bot): Promise<string | null> {
    const slots = [
      { name: "head", type: "helmet", slotIdx: 5 },
      { name: "torso", type: "chestplate", slotIdx: 6 },
      { name: "legs", type: "leggings", slotIdx: 7 },
      { name: "feet", type: "boots", slotIdx: 8 }
    ];

    for (const piece of slots) {
      const current = bot.inventory.slots[piece.slotIdx];
      const currentScore = current ? (ARMOR_PRIORITY[current.name] || 0) : 0;

      const candidates = bot.inventory.items().filter((i) => i.name.endsWith(piece.type));
      let bestItem = current;
      let bestScore = currentScore;

      for (const cand of candidates) {
        const score = ARMOR_PRIORITY[cand.name] || 0;
        if (score > bestScore) {
          bestScore = score;
          bestItem = cand;
        }
      }

      if (bestItem && bestItem !== current) {
        try {
          await bot.equip(bestItem, piece.name as any);
          return `Equipped better ${bestItem.name}`;
        } catch {}
      }
    }

    return null;
  }

  public getSnapshot(bot: Bot | null): SurvivalSnapshot {
    const base = foodManager.getSnapshot(bot);
    base.currentPriority = this.currentPriority;
    base.recoveryState = this.recoveryState;
    return base;
  }
}

export const survival = new SurvivalManager();

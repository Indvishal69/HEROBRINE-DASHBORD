import type { AutonomyLevel, AutonomyConfig, PersonalityProfile } from "../types/autonomy.js";
import { AppSettingsRepo, AuditRepo } from "../storage/database.js";
import crypto from "node:crypto";

export class AutonomyManager {
  public getConfig(): AutonomyConfig {
    return AppSettingsRepo.get<AutonomyConfig>("autonomy_config", {
      currentLevel: 4, // LEVEL 4 — ADVANCED SMP COMPANION by default
      maxUnattendedHours: 8,
      quietHoursEnabled: false,
      quietHoursStart: 23,
      quietHoursEnd: 7,
      allowDestructiveActions: false,
      requireAdminConfirmationForRollbacks: true,
      personality: "balanced"
    });
  }

  public saveConfig(patch: Partial<AutonomyConfig>): AutonomyConfig {
    const current = this.getConfig();
    const updated = { ...current, ...patch };
    AppSettingsRepo.set("autonomy_config", updated);

    AuditRepo.add({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      actor: "dashboard",
      action: "autonomy_config_updated",
      component: "autonomy_manager",
      severity: "info",
      details: { newLevel: updated.currentLevel, personality: updated.personality }
    });

    return updated;
  }

  public setLevel(level: AutonomyLevel): AutonomyConfig {
    return this.saveConfig({ currentLevel: level });
  }

  public isQuietHoursActive(): boolean {
    const config = this.getConfig();
    if (!config.quietHoursEnabled) return false;

    const currentHour = new Date().getHours();
    if (config.quietHoursStart <= config.quietHoursEnd) {
      return currentHour >= config.quietHoursStart && currentHour < config.quietHoursEnd;
    } else {
      // Over midnight (e.g. 23 to 7)
      return currentHour >= config.quietHoursStart || currentHour < config.quietHoursEnd;
    }
  }

  /**
   * Evaluates if a proposed action is permitted under the current autonomy level and safety rules
   */
  public canExecute(
    actionType: string,
    requestedBy = "autonomous",
    isDestructive = false,
    isPrivileged = false
  ): { permitted: boolean; reason?: string } {
    const config = this.getConfig();

    // 1. Destructive actions safety gate: Always requires explicit allowDestructiveActions
    if (isDestructive && !config.allowDestructiveActions && requestedBy === "autonomous") {
      return {
        permitted: false,
        reason: "Destructive action blocked: requires owner configuration and manual confirmation."
      };
    }

    // 2. Quiet hours check: Suppresses autonomous background jobs during quiet hours
    if (this.isQuietHoursActive() && requestedBy === "autonomous" && !["eat", "defend", "retreat"].includes(actionType)) {
      return {
        permitted: false,
        reason: "Quiet hours active: non-essential autonomous actions are paused."
      };
    }

    // 3. Autonomy Level Gate
    switch (config.currentLevel) {
      case 0: // OBSERVE
        if (["inspect", "observe", "status", "look"].includes(actionType)) {
          return { permitted: true };
        }
        return {
          permitted: false,
          reason: "Autonomy Level 0 (OBSERVE) is active. The bot is in observation-only mode and cannot alter the world."
        };

      case 1: // ASSIST
        if (requestedBy === "autonomous") {
          return {
            permitted: false,
            reason: "Autonomy Level 1 (ASSIST) requires explicit user requests. Autonomous background tasks are disabled."
          };
        }
        return { permitted: true };

      case 2: // AUTONOMOUS SURVIVAL
        if (["eat", "equip_armor", "retreat", "avoid_hazard", "sleep", "harvest_food"].includes(actionType)) {
          return { permitted: true };
        }
        if (requestedBy !== "autonomous") {
          return { permitted: true };
        }
        return {
          permitted: false,
          reason: "Autonomy Level 2 restricts autonomous operations to survival and self-preservation only."
        };

      case 3: // AUTONOMOUS PROJECTS
        if (["combat_pvp", "boss_expedition", "nether_expedition"].includes(actionType)) {
          return {
            permitted: false,
            reason: "High-risk combat and cross-dimension expeditions require Autonomy Level 4 or 5."
          };
        }
        return { permitted: true };

      case 4: // ADVANCED SMP COMPANION
        if (actionType === "combat_pvp") {
          return {
            permitted: false,
            reason: "PvP combat requires Autonomy Level 5 (Owner-Configured Expert Mode) and explicit duel approval."
          };
        }
        return { permitted: true };

      case 5: // OWNER-CONFIGURED EXPERT
        return { permitted: true };

      default:
        return { permitted: false, reason: "Invalid autonomy level" };
    }
  }
}

export const autonomyManager = new AutonomyManager();

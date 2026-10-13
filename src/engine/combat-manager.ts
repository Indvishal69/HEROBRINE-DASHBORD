import type { Bot } from "mineflayer";
import crypto from "node:crypto";
import type { 
  CombatConfig, 
  CombatState, 
  CombatMode, 
  CombatTarget, 
  CombatSnapshot, 
  CombatEventRecord 
} from "../types/combat.js";
import { actionCoordinator, ActionCoordinator } from "./action-coordinator.js";
import { AppSettingsRepo, AuditRepo } from "../storage/database.js";

const WEAPON_DAMAGE: Record<string, number> = {
  netherite_sword: 8,
  diamond_sword: 7,
  iron_sword: 6,
  stone_sword: 5,
  wooden_sword: 4,
  golden_sword: 4,
  netherite_axe: 10,
  diamond_axe: 9,
  iron_axe: 9,
  stone_axe: 9,
  wooden_axe: 7
};

export class CombatManager {
  private state: CombatState = "IDLE";
  private currentTarget: CombatTarget | null = null;
  private lastAttackTime = 0;
  private lastDamageTaken = 0;
  private lastCombatEvent: string | null = null;
  private isRetreating = false;
  private combatLogs: CombatEventRecord[] = [];
  private stateChangeListeners: Array<(state: CombatState) => void> = [];

  public getConfig(): CombatConfig {
    return AppSettingsRepo.get<CombatConfig>("combat_config", {
      enabled: false, // Strictly DISABLED by default as required
      mode: "disabled",
      approvedTargets: [],
      protectedPlayers: [],
      currentDuelOpponent: null,
      minHealthRetreatThreshold: 7,
      maxEngagementDistance: 16,
      preferredWeapon: "sword",
      allowShield: true,
      allowRareConsumables: false,
      attackCooldownMs: 625, // 1.21.x Sword speed cooldown (~1.6 attacks/sec)
      strafeEnabled: true
    });
  }

  public saveConfig(config: Partial<CombatConfig>): CombatConfig {
    const current = this.getConfig();
    const updated = { ...current, ...config };
    AppSettingsRepo.set("combat_config", updated);
    return updated;
  }

  public getState(): CombatState {
    return this.state;
  }

  public getTarget(): CombatTarget | null {
    return this.currentTarget;
  }

  public getCombatLogs(limit = 30): CombatEventRecord[] {
    return this.combatLogs.slice(-limit).reverse();
  }

  /**
   * Sets combat state with deterministic transition validation
   */
  public transitionTo(newState: CombatState, reason?: string): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.logEvent("reposition", `State transitioned: ${oldState} -> ${newState}${reason ? ` (${reason})` : ""}`);

    for (const listener of this.stateChangeListeners) {
      try {
        listener(newState);
      } catch {}
    }
  }

  /**
   * Verifies if a given target is authorized according to strict policy
   */
  public isTargetPermitted(targetName: string, isPlayer = true): boolean {
    const config = this.getConfig();

    // 1. PvP must be globally enabled
    if (!config.enabled || config.mode === "disabled") {
      return false;
    }

    // 2. Protected players cannot be targeted under any circumstances
    if (config.protectedPlayers.some((p) => p.toLowerCase() === targetName.toLowerCase())) {
      return false;
    }

    // 3. Mode-specific authorization
    if (config.mode === "approved_duel") {
      return config.currentDuelOpponent?.toLowerCase() === targetName.toLowerCase();
    }

    if (config.mode === "owner_authorized" || config.mode === "custom") {
      return config.approvedTargets.some((t) => t.toLowerCase() === targetName.toLowerCase());
    }

    if (config.mode === "defensive") {
      // In defensive mode, can target approved players or hostile mobs
      return !isPlayer || config.approvedTargets.some((t) => t.toLowerCase() === targetName.toLowerCase());
    }

    if (config.mode === "practice") {
      return config.approvedTargets.some((t) => t.toLowerCase() === targetName.toLowerCase());
    }

    return false;
  }

  /**
   * Starts an approved duel against a specific opponent
   */
  public startApprovedDuel(opponentName: string): { success: boolean; message: string } {
    const config = this.getConfig();
    if (!config.enabled) {
      return { success: false, message: "PvP is currently disabled in settings. Enable PvP first." };
    }

    if (config.protectedPlayers.some((p) => p.toLowerCase() === opponentName.toLowerCase())) {
      return { success: false, message: `Player ${opponentName} is protected and cannot be dueled.` };
    }

    this.saveConfig({
      mode: "approved_duel",
      currentDuelOpponent: opponentName,
      approvedTargets: [opponentName]
    });

    this.transitionTo("TARGET_VALIDATION", `Duel initiated with ${opponentName}`);
    this.logEvent("engage", `Duel approved with ${opponentName}`);
    return { success: true, message: `Approved duel set against ${opponentName}` };
  }

  /**
   * Stops combat immediately and releases all action locks
   */
  public stopCombat(reason = "User requested stop"): void {
    this.currentTarget = null;
    this.isRetreating = false;
    this.transitionTo("IDLE", reason);
    actionCoordinator.releaseAction("combat");
    actionCoordinator.releaseAction("combat_retreat");
    this.logEvent("disengage", reason);
  }

  /**
   * Emergency retreat triggered by low health or user command
   */
  public triggerEmergencyRetreat(bot: Bot | null, reason = "Emergency retreat requested"): void {
    this.isRetreating = true;
    this.transitionTo("RECOVERY", reason);
    this.logEvent("retreat", reason);

    if (bot && bot.entity) {
      actionCoordinator.requestAction("combat_retreat", ActionCoordinator.PRIORITY_EMERGENCY, "all");
      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
      }
      bot.clearControlStates();

      // Equip shield in offhand if available
      const shield = bot.inventory.items().find((i) => i.name === "shield");
      if (shield && bot.inventory.slots[45]?.name !== "shield") {
        try { bot.equip(shield, "off-hand"); } catch {}
      }

      // If threat exists, move in opposite direction
      if (this.currentTarget) {
        const targetPos = this.currentTarget.position;
        const currentPos = bot.entity.position;
        const diffX = currentPos.x - targetPos.x;
        const diffZ = currentPos.z - targetPos.z;
        const angle = Math.atan2(diffZ, diffX);
        const retreatDist = 12;

        const escapeX = currentPos.x + Math.cos(angle) * retreatDist;
        const escapeZ = currentPos.z + Math.sin(angle) * retreatDist;

        import("mineflayer-pathfinder").then(({ goals }) => {
          if (bot.pathfinder) {
            bot.pathfinder.setGoal(new goals.GoalNear(escapeX, currentPos.y, escapeZ, 2));
          }
        }).catch(() => {});
      }
    }
  }

  /**
   * Main combat execution loop called periodically by the bot connection
   */
  public async tick(bot: Bot): Promise<void> {
    if (!bot || !bot.entity) return;

    const config = this.getConfig();

    // 1. Guard: PvP disabled
    if (!config.enabled || config.mode === "disabled") {
      if (this.state !== "IDLE") {
        this.stopCombat("PvP disabled by configuration");
      }
      return;
    }

    const health = bot.health ?? 20;

    // 2. Guard: Critical health triggers Emergency Retreat
    if (health <= config.minHealthRetreatThreshold && this.state !== "IDLE" && !this.isRetreating) {
      this.triggerEmergencyRetreat(bot, `Health low (${health}/20 <= ${config.minHealthRetreatThreshold})`);
      return;
    }

    // 3. State Machine Execution
    switch (this.state) {
      case "IDLE":
        // Check for legitimate threats or duel targets
        this.evaluatePotentialTargets(bot);
        break;

      case "TARGET_VALIDATION":
        await this.handleTargetValidation(bot);
        break;

      case "PREPARATION":
        await this.handlePreparation(bot);
        break;

      case "ENGAGE":
        await this.handleEngage(bot);
        break;

      case "DEFEND_OR_REPOSITION":
        await this.handleDefendOrReposition(bot);
        break;

      case "RECOVERY":
        // In recovery, await health stabilization or disengage
        if (health > config.minHealthRetreatThreshold + 4) {
          this.isRetreating = false;
          actionCoordinator.releaseAction("combat_retreat");
          this.transitionTo("RESUME_OR_DISENGAGE", "Health stabilized");
        }
        break;

      case "RESUME_OR_DISENGAGE":
        // Decide whether to re-engage or return to IDLE
        if (this.currentTarget && this.isTargetPermitted(this.currentTarget.username, this.currentTarget.isPlayer)) {
          this.transitionTo("ENGAGE", "Resuming combat");
        } else {
          this.stopCombat("Combat concluded");
        }
        break;
    }
  }

  private evaluatePotentialTargets(bot: Bot): void {
    const config = this.getConfig();
    if (config.mode === "approved_duel" && config.currentDuelOpponent) {
      const p = Object.values(bot.players).find(
        (pl) => pl.username?.toLowerCase() === config.currentDuelOpponent?.toLowerCase() && pl.entity
      );
      if (p && p.entity) {
        this.currentTarget = {
          id: p.entity.id,
          username: p.username,
          entityType: "player",
          isPlayer: true,
          position: { x: p.entity.position.x, y: p.entity.position.y, z: p.entity.position.z },
          distance: bot.entity.position.distanceTo(p.entity.position),
          lastSeenAt: Date.now(),
          lineOfSight: true
        };
        this.transitionTo("TARGET_VALIDATION", `Found duel opponent ${p.username}`);
      }
    }
  }

  private async handleTargetValidation(bot: Bot): Promise<void> {
    if (!this.currentTarget) {
      this.transitionTo("IDLE", "Target is null");
      return;
    }

    // Verify permission
    if (!this.isTargetPermitted(this.currentTarget.username, this.currentTarget.isPlayer)) {
      this.stopCombat(`Target ${this.currentTarget.username} is not permitted by policy`);
      return;
    }

    this.transitionTo("PREPARATION", "Target validated");
  }

  private async handlePreparation(bot: Bot): Promise<void> {
    // Acquire ActionCoordinator lock
    const locked = actionCoordinator.requestAction("combat", ActionCoordinator.PRIORITY_COMBAT, "all");
    if (!locked) {
      // Postpone preparation if preempted
      return;
    }

    // Equip best weapon
    await this.equipBestWeapon(bot);

    // Equip shield in offhand if allowed
    const config = this.getConfig();
    if (config.allowShield) {
      const shield = bot.inventory.items().find((i) => i.name === "shield");
      if (shield && bot.inventory.slots[45]?.name !== "shield") {
        try { await bot.equip(shield, "off-hand"); } catch {}
      }
    }

    this.transitionTo("ENGAGE", "Equipment ready");
  }

  private async handleEngage(bot: Bot): Promise<void> {
    if (!this.currentTarget) {
      this.transitionTo("IDLE", "No target");
      return;
    }

    // Find live entity
    const targetEntity = bot.entities[this.currentTarget.id] || 
      Object.values(bot.entities).find((e) => (e as any).username === this.currentTarget?.username);

    if (!targetEntity || !targetEntity.position) {
      // Check for stale target (>3s)
      if (Date.now() - this.currentTarget.lastSeenAt > 3000) {
        this.logEvent("target_lost", `Target ${this.currentTarget.username} disappeared`);
        this.transitionTo("RESUME_OR_DISENGAGE", "Target lost");
        return;
      }
      return;
    }

    // Update observations
    this.currentTarget.lastSeenAt = Date.now();
    this.currentTarget.position = {
      x: targetEntity.position.x,
      y: targetEntity.position.y,
      z: targetEntity.position.z
    };
    this.currentTarget.distance = bot.entity.position.distanceTo(targetEntity.position);

    const config = this.getConfig();

    // Engagement distance & pathfinding
    if (this.currentTarget.distance > 3.5) {
      if (bot.pathfinder) {
        const { goals } = await import("mineflayer-pathfinder");
        bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2.5), true);
      }
    } else {
      // In melee reach
      await bot.lookAt(targetEntity.position.offset(0, 1.4, 0));

      const now = Date.now();
      if (now - this.lastAttackTime >= config.attackCooldownMs) {
        this.lastAttackTime = now;
        try {
          bot.attack(targetEntity);
          this.logEvent("hit", `Attacked ${this.currentTarget.username} (dist: ${this.currentTarget.distance.toFixed(1)}m)`);
        } catch {}
      }

      // Reposition / strafe if enabled
      if (config.strafeEnabled && Math.random() < 0.3) {
        this.transitionTo("DEFEND_OR_REPOSITION", "Strafing angle");
      }
    }
  }

  private async handleDefendOrReposition(bot: Bot): Promise<void> {
    // Quick defensive maneuver (e.g. raise shield or strafe step)
    if (this.currentTarget && bot.entity) {
      try {
        bot.setControlState("left", Math.random() > 0.5);
        setTimeout(() => {
          try {
            bot.clearControlStates();
            this.transitionTo("ENGAGE", "Reposition completed");
          } catch {}
        }, 400);
      } catch {
        this.transitionTo("ENGAGE", "Reposition skipped");
      }
    } else {
      this.transitionTo("ENGAGE");
    }
  }

  private async equipBestWeapon(bot: Bot): Promise<void> {
    const config = this.getConfig();
    const items = bot.inventory.items();

    let bestWeapon = null;
    let highestDmg = 0;

    for (const item of items) {
      const dmg = WEAPON_DAMAGE[item.name] || 0;
      if (config.preferredWeapon === "sword" && !item.name.endsWith("_sword")) continue;
      if (config.preferredWeapon === "axe" && !item.name.endsWith("_axe")) continue;

      if (dmg > highestDmg) {
        highestDmg = dmg;
        bestWeapon = item;
      }
    }

    if (!bestWeapon) {
      // Fallback: any sword or axe regardless of preference
      for (const item of items) {
        const dmg = WEAPON_DAMAGE[item.name] || 0;
        if (dmg > highestDmg) {
          highestDmg = dmg;
          bestWeapon = item;
        }
      }
    }

    if (bestWeapon) {
      try {
        await bot.equip(bestWeapon, "hand");
      } catch {}
    }
  }

  private logEvent(type: CombatEventRecord["type"], details: string, damage?: number): void {
    const record: CombatEventRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      targetName: this.currentTarget?.username,
      details,
      damage
    };
    this.lastCombatEvent = details;
    this.combatLogs.push(record);
    if (this.combatLogs.length > 50) this.combatLogs.shift();

    AuditRepo.add({
      id: record.id,
      timestamp: record.timestamp,
      actor: "combat_manager",
      action: `combat_${type}`,
      component: "combat_ai",
      severity: type === "retreat" || type === "error" ? "warn" : "info",
      details: { target: this.currentTarget?.username, details }
    });
  }

  public getSnapshot(bot: Bot | null): CombatSnapshot {
    const config = this.getConfig();
    const mainhand = bot?.inventory?.slots[bot?.quickBarSlot ? bot.quickBarSlot + 36 : 36];
    const offhand = bot?.inventory?.slots[45];

    let weaponDurability = null;
    if (mainhand) {
      const maxDurability = (mainhand as any).maxDurability || 0;
      const durabilityUsed = (mainhand as any).durabilityUsed || 0;
      if (maxDurability > 0) {
        weaponDurability = { current: maxDurability - durabilityUsed, max: maxDurability };
      }
    }

    const isStale = this.currentTarget ? (Date.now() - this.currentTarget.lastSeenAt > 3000) : false;

    return {
      state: this.state,
      mode: config.mode,
      enabled: config.enabled,
      hasTarget: this.currentTarget !== null,
      target: this.currentTarget,
      selectedWeapon: mainhand?.name || null,
      weaponDurability,
      offhandItem: offhand?.name || null,
      distanceToTarget: this.currentTarget?.distance || null,
      lineOfSight: this.currentTarget?.lineOfSight ?? true,
      recentDamageTaken: this.lastDamageTaken,
      lastCombatEvent: this.lastCombatEvent,
      lastActionTimestamp: Date.now(),
      isRetreating: this.isRetreating,
      staleTarget: isStale
    };
  }
}

export const combatManager = new CombatManager();

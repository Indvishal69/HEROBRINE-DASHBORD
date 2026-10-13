import type { Bot } from "mineflayer";
import type { CombatConfig, CombatState, CombatTarget, CombatSnapshot, CombatEventRecord } from "../types/combat.js";
export declare class CombatManager {
    private state;
    private currentTarget;
    private lastAttackTime;
    private lastDamageTaken;
    private lastCombatEvent;
    private isRetreating;
    private combatLogs;
    private stateChangeListeners;
    getConfig(): CombatConfig;
    saveConfig(config: Partial<CombatConfig>): CombatConfig;
    getState(): CombatState;
    getTarget(): CombatTarget | null;
    getCombatLogs(limit?: number): CombatEventRecord[];
    /**
     * Sets combat state with deterministic transition validation
     */
    transitionTo(newState: CombatState, reason?: string): void;
    /**
     * Verifies if a given target is authorized according to strict policy
     */
    isTargetPermitted(targetName: string, isPlayer?: boolean): boolean;
    /**
     * Starts an approved duel against a specific opponent
     */
    startApprovedDuel(opponentName: string): {
        success: boolean;
        message: string;
    };
    /**
     * Stops combat immediately and releases all action locks
     */
    stopCombat(reason?: string): void;
    /**
     * Emergency retreat triggered by low health or user command
     */
    triggerEmergencyRetreat(bot: Bot | null, reason?: string): void;
    /**
     * Main combat execution loop called periodically by the bot connection
     */
    tick(bot: Bot): Promise<void>;
    private evaluatePotentialTargets;
    private handleTargetValidation;
    private handlePreparation;
    private handleEngage;
    private handleDefendOrReposition;
    private equipBestWeapon;
    private logEvent;
    getSnapshot(bot: Bot | null): CombatSnapshot;
}
export declare const combatManager: CombatManager;

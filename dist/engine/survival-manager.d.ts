import type { Bot } from "mineflayer";
import type { SurvivalPriority, RecoveryState, SurvivalSnapshot } from "../types/survival.js";
export declare class SurvivalManager {
    private lastEvaluationTime;
    private currentPriority;
    private recoveryState;
    private isRecovering;
    getRecoveryState(): RecoveryState;
    getCurrentPriority(): SurvivalPriority | null;
    /**
     * Main survival loop called by the bot connection
     */
    evaluate(bot: Bot): Promise<{
        actionTaken: string | null;
    }>;
    /**
     * Handles Emergency Survival recovery routine
     */
    private handleCriticalSurvival;
    triggerEmergencyRecovery(bot: Bot | null): Promise<{
        success: boolean;
        message: string;
    }>;
    private equipBestArmor;
    getSnapshot(bot: Bot | null): SurvivalSnapshot;
}
export declare const survival: SurvivalManager;

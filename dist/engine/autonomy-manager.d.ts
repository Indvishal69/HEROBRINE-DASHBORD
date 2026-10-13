import type { AutonomyLevel, AutonomyConfig } from "../types/autonomy.js";
export declare class AutonomyManager {
    getConfig(): AutonomyConfig;
    saveConfig(patch: Partial<AutonomyConfig>): AutonomyConfig;
    setLevel(level: AutonomyLevel): AutonomyConfig;
    isQuietHoursActive(): boolean;
    /**
     * Evaluates if a proposed action is permitted under the current autonomy level and safety rules
     */
    canExecute(actionType: string, requestedBy?: string, isDestructive?: boolean, isPrivileged?: boolean): {
        permitted: boolean;
        reason?: string;
    };
}
export declare const autonomyManager: AutonomyManager;

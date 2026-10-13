import type { Bot } from "mineflayer";
export declare class SurvivalManager {
    private isEating;
    private lastCheckTime;
    evaluate(bot: Bot): Promise<{
        actionTaken: string | null;
    }>;
    private equipBestArmor;
}
export declare const survival: SurvivalManager;

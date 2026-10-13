import type { Bot } from "mineflayer";
export declare class ManualControlManager {
    private active;
    private heldControls;
    isManualActive(): boolean;
    setManualActive(active: boolean, bot: Bot | null): void;
    handleControlPress(bot: Bot, control: string, pressed: boolean): void;
    handleLook(bot: Bot, yaw: number, pitch: number): void;
    releaseAll(bot: Bot): void;
}
export declare const manualControl: ManualControlManager;

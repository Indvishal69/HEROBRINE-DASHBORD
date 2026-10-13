import type { Bot } from "mineflayer";
import type { WorldSnapshot } from "../types/bot.js";
export declare class PerceptionEngine {
    captureSnapshot(bot: Bot | null, activeTaskTitle?: string | null): WorldSnapshot;
    compressForPrompt(snapshot: WorldSnapshot): string;
}
export declare const perception: PerceptionEngine;

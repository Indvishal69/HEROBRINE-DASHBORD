import type { Bot } from "mineflayer";
import type { BlueprintRecord } from "../types/tasks.js";
export declare class BuildingEngine {
    calculateManifest(blueprint: BlueprintRecord, inventoryItems: Array<{
        name: string;
        count: number;
    }>): {
        required: Record<string, number>;
        available: Record<string, number>;
        missing: Record<string, number>;
        canBuild: boolean;
    };
    constructBlueprint(bot: Bot, blueprint: BlueprintRecord, origin: {
        x: number;
        y: number;
        z: number;
    }, startStep?: number, onProgress?: (placed: number, total: number) => void): Promise<{
        placedCount: number;
        completed: boolean;
    }>;
}
export declare const building: BuildingEngine;

import type { BotCoordinates } from "./bot.js";
export type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type TaskType = "goto" | "follow" | "mine" | "harvest" | "build" | "repair" | "craft" | "smelt" | "store" | "retrieve" | "guard" | "custom";
export interface TaskCheckpoint {
    stepIndex: number;
    totalSteps: number;
    progressPercent: number;
    lastPosition?: BotCoordinates;
    data: Record<string, unknown>;
    updatedAt: number;
}
export interface TaskRecord {
    id: string;
    type: TaskType;
    title: string;
    description?: string;
    requestedBy: string;
    priority: number;
    status: TaskStatus;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
    checkpoint?: TaskCheckpoint;
    params: Record<string, unknown>;
}
export interface BlueprintBlock {
    relX: number;
    relY: number;
    relZ: number;
    blockName: string;
    properties?: Record<string, string>;
}
export interface BlueprintRecord {
    id: string;
    name: string;
    description?: string;
    dimensions: {
        x: number;
        y: number;
        z: number;
    };
    totalBlocks: number;
    requiredMaterials: Record<string, number>;
    blocks: BlueprintBlock[];
    createdAt: number;
}

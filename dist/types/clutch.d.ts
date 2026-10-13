export type ClutchMode = "disabled" | "practice" | "survival_emergency";
export type ClutchStrategy = "water_bucket" | "hay_bale" | "slime_block" | "cobweb" | "powder_snow_bucket" | "totem_of_undying" | "steer_to_water" | "steer_to_cushion" | "passive_safe" | "none";
export type ClutchState = "idle" | "falling" | "aiming" | "placing" | "landed" | "recovering_water" | "failed";
export type ClutchResultStatus = "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
export type ClutchFailureReason = "MISSED_TIMING_WINDOW" | "NO_CLUTCH_ITEMS" | "UNSUPPORTED_SURFACE" | "NETHER_WATER_EVAPORATION" | "OBSTRUCTED_TARGET" | "HIGH_LATENCY" | "VOID_FALL" | "HEALTH_DEPLETED";
export interface ClutchItemEntry {
    name: string;
    count: number;
    priority: number;
    effectiveDimensions: string[];
}
export interface ClutchEventRecord {
    id: string;
    timestamp: number;
    dimension: string;
    fallHeight: number;
    verticalVelocity: number;
    strategy: ClutchStrategy;
    itemUsed?: string;
    status: ClutchResultStatus;
    damageTaken: number;
    timingDeltaMs?: number;
    failureReason?: ClutchFailureReason;
    recoveredWater?: boolean;
}
export interface ClutchStats {
    totalAttempts: number;
    successful: number;
    partial: number;
    failed: number;
    successRate: number;
    avgPlacementDelayMs: number;
}
export interface ClutchConfig {
    mode: ClutchMode;
    minFallHeightThreshold: number;
    triggerDistanceBlocks: number;
    triggerTimeMs: number;
    autoRecoverWater: boolean;
    steerToNearbySafeSurfaces: boolean;
    preferredItemOrder: string[];
}
export interface ClutchSnapshot {
    isFalling: boolean;
    fallDistance: number;
    verticalVelocity: number;
    estimatedLandingTimeMs: number;
    predictedDamage: number;
    impactY: number;
    surfaceBlockName?: string;
    mode: ClutchMode;
    state: ClutchState;
    selectedStrategy: ClutchStrategy;
    availableItems: ClutchItemEntry[];
    lastClutchResult?: ClutchEventRecord;
    stats: ClutchStats;
}
export interface ClutchArenaDrill {
    fallHeight: number;
    surfaceType: "stone" | "water" | "hay_block" | "slime_block" | "netherrack";
    dimension: "overworld" | "nether" | "end";
}

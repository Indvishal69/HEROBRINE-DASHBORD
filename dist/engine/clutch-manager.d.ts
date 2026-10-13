import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import type { ClutchConfig, ClutchSnapshot, ClutchState, ClutchStrategy, ClutchItemEntry, ClutchEventRecord, ClutchStats, ClutchArenaDrill } from "../types/clutch.js";
export declare class ClutchManager {
    private config;
    private state;
    private activeBot;
    private isFalling;
    private fallStartHeight;
    private peakFallVelocity;
    private consecutiveFallTicks;
    private activeStrategy;
    private targetImpactY;
    private targetSurfaceName;
    private placementTriggered;
    private placementTimestamp;
    private waterPlacedPosition;
    private healthBeforeImpact;
    private lastClutchResult;
    private stats;
    private delaySamples;
    private physicsTickHandler;
    private deathHandler;
    private respawnHandler;
    constructor();
    getConfig(): ClutchConfig;
    updateConfig(patch: Partial<ClutchConfig>): void;
    getState(): ClutchState;
    getStats(): ClutchStats;
    getLastResult(): ClutchEventRecord | null;
    /**
     * Attaches high-frequency physics tick and life cycle listeners to the Mineflayer bot
     */
    attach(bot: Bot): void;
    /**
     * Detaches listeners and releases locks cleanly
     */
    detach(): void;
    /**
     * Generates a comprehensive live snapshot for the dashboard and telemetry
     */
    getSnapshot(bot?: Bot | null): ClutchSnapshot;
    /**
     * Core 20 TPS Physics Tick evaluation:
     * Real-time deterministic detection and execution without AI request delays.
     */
    private onPhysicsTick;
    /**
     * Selects optimal clutch method based on dimension, environment, and items
     */
    selectClutchStrategy(bot: Bot, surface: {
        y: number;
        name: string;
        isSolid: boolean;
        isCushion: boolean;
    }, distanceToGround: number): {
        strategy: ClutchStrategy;
        item?: string;
        alternativeCoordinate?: Vec3;
    };
    /**
     * Scans downwards from bot's position to find the impact surface
     */
    detectImpactSurface(bot: Bot): {
        y: number;
        name: string;
        isSolid: boolean;
        isCushion: boolean;
    } | null;
    /**
     * Simulates 1.21.x terminal velocity step-by-step
     * Java Edition vertical drag: 0.98, gravity: 0.08 blocks/tick^2
     */
    simulateLanding(currentY: number, currentVy: number, targetY: number): {
        ticks: number;
        timeMs: number;
        finalVy: number;
    };
    /**
     * Calculates predicted unmitigated fall damage (damage = max(0, fallDistance - 3))
     */
    calculatePredictedDamage(fallDistance: number): number;
    /**
     * Checks inventory for clutch utilities and assigns priority
     */
    getAvailableClutchItems(bot: Bot): ClutchItemEntry[];
    /**
     * Scans horizontally within radius for safe water pools or hay blocks
     */
    private findNearbySafeSurface;
    /**
     * Executes lateral air acceleration steering towards safe water / cushion
     */
    private executeLateralDrift;
    /**
     * Realizes instant item equip, aim downward, and placement
     */
    private executeClutchPlacement;
    /**
     * Handles landing verification and water retrieval
     */
    private handleLanding;
    /**
     * Recovers placed water with empty bucket
     */
    private recoverPlacedWater;
    /**
     * Handles death during fall / clutch failure
     */
    private handleDeath;
    /**
     * Handles post-death recovery
     */
    private handleRespawn;
    private recordClutchFailure;
    private resetFallState;
    private updateStats;
    private loadStats;
    private isPlacementStrategy;
    private getNormalizedDimension;
    /**
     * Local Test Arena Drill Execution:
     * Simulates or sets up a controlled test fall with configurable height and surface.
     */
    runArenaDrill(bot: Bot, drill: ClutchArenaDrill): Promise<{
        drillId: string;
        result: ClutchEventRecord;
        simulated: boolean;
        timingSummary: string;
    }>;
}
export declare const clutchManager: ClutchManager;

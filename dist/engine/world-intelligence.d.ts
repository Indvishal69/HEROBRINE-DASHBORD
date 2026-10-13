import type { WorldLandmark, LandmarkCategory, ObservationSource, KnownRoute, WorldIntelligenceSnapshot } from "../types/world-intelligence.js";
import type { BotCoordinates } from "../types/bot.js";
export declare class WorldIntelligenceEngine {
    private dynamicLandmarks;
    private observedResources;
    private knownRoutes;
    constructor();
    private loadFromStorage;
    recordLandmark(name: string, category: LandmarkCategory, position: BotCoordinates, dimension?: "overworld" | "the_nether" | "the_end", source?: ObservationSource, ttlMs?: number, // 30 min default
    metadata?: Record<string, unknown>): WorldLandmark;
    getLandmarks(filterStale?: boolean): WorldLandmark[];
    findNearest(pos: BotCoordinates, category?: LandmarkCategory, dimension?: string): {
        landmark: WorldLandmark;
        distance: number;
    } | null;
    recordRoute(name: string, startPos: BotCoordinates, endPos: BotCoordinates, dimension?: string, dangerScore?: number): KnownRoute;
    getSnapshot(currentDimension?: string): WorldIntelligenceSnapshot;
}
export declare const worldIntelligence: WorldIntelligenceEngine;

import type { BotCoordinates } from "./bot.js";
export type LandmarkCategory = "home" | "bed" | "chest" | "farm" | "mine" | "construction" | "portal" | "village" | "hazard" | "pvp_zone" | "restricted_boundary" | "poi";
export type ObservationSource = "currently_observed" | "previously_observed" | "inferred" | "player_reported";
export interface WorldLandmark {
    id: string;
    name: string;
    category: LandmarkCategory;
    position: BotCoordinates;
    dimension: "overworld" | "the_nether" | "the_end";
    confidence: number;
    source: ObservationSource;
    observedAt: number;
    expiresAt: number;
    isStale: boolean;
    metadata?: Record<string, unknown>;
}
export interface ObservedResource {
    id: string;
    resourceName: string;
    position: BotCoordinates;
    dimension: string;
    count: number;
    observedAt: number;
    isExtracted: boolean;
}
export interface KnownRoute {
    id: string;
    name: string;
    startPos: BotCoordinates;
    endPos: BotCoordinates;
    dimension: string;
    estimatedCost: number;
    dangerScore: number;
    lastTraversedAt?: number;
    isVerified: boolean;
}
export interface WorldIntelligenceSnapshot {
    totalLandmarks: number;
    activeLandmarks: WorldLandmark[];
    staleLandmarksCount: number;
    knownRoutesCount: number;
    observedResourcesCount: number;
    currentDimension: string;
    lastUpdated: number;
}

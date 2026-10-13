import crypto from "node:crypto";
import type { 
  WorldLandmark, 
  LandmarkCategory, 
  ObservationSource, 
  ObservedResource, 
  KnownRoute, 
  WorldIntelligenceSnapshot 
} from "../types/world-intelligence.js";
import type { BotCoordinates } from "../types/bot.js";
import { LandmarkRepo } from "../storage/database.js";

export class WorldIntelligenceEngine {
  private dynamicLandmarks: Map<string, WorldLandmark> = new Map();
  private observedResources: Map<string, ObservedResource> = new Map();
  private knownRoutes: Map<string, KnownRoute> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const dbLandmarks = LandmarkRepo.getAll();
      for (const lm of dbLandmarks) {
        this.dynamicLandmarks.set(lm.id, {
          id: lm.id,
          name: lm.name,
          category: lm.category as LandmarkCategory,
          position: lm.coordinates,
          dimension: (lm.dimension as any) || "overworld",
          confidence: 1.0,
          source: "previously_observed",
          observedAt: lm.createdAt,
          expiresAt: lm.createdAt + 86400000, // 24h default for permanent landmarks
          isStale: false,
          metadata: lm.description ? { description: lm.description } : undefined
        });
      }
    } catch {}
  }

  public recordLandmark(
    name: string,
    category: LandmarkCategory,
    position: BotCoordinates,
    dimension: "overworld" | "the_nether" | "the_end" = "overworld",
    source: ObservationSource = "currently_observed",
    ttlMs = 1800000, // 30 min default
    metadata?: Record<string, unknown>
  ): WorldLandmark {
    const id = crypto.randomUUID();
    const now = Date.now();
    const landmark: WorldLandmark = {
      id,
      name,
      category,
      position,
      dimension,
      confidence: source === "currently_observed" ? 1.0 : 0.7,
      source,
      observedAt: now,
      expiresAt: now + ttlMs,
      isStale: false,
      metadata
    };

    this.dynamicLandmarks.set(id, landmark);

    // If permanent landmark, persist to database
    if (["home", "bed", "chest", "farm", "village", "construction"].includes(category)) {
      try {
        const dbCategory: any = ["home", "base", "mine", "farm", "storage", "portal"].includes(category) 
          ? category 
          : "poi";

        LandmarkRepo.upsert({
          id,
          name,
          category: dbCategory,
          coordinates: position,
          dimension,
          description: String(metadata?.description || ""),
          tags: [category],
          createdAt: now
        });
      } catch {}
    }

    return landmark;
  }

  public getLandmarks(filterStale = true): WorldLandmark[] {
    const now = Date.now();
    const list: WorldLandmark[] = [];

    for (const lm of this.dynamicLandmarks.values()) {
      if (now > lm.expiresAt) {
        lm.isStale = true;
      }
      if (!filterStale || !lm.isStale) {
        list.push(lm);
      }
    }

    return list;
  }

  public findNearest(
    pos: BotCoordinates,
    category?: LandmarkCategory,
    dimension = "overworld"
  ): { landmark: WorldLandmark; distance: number } | null {
    let nearest: WorldLandmark | null = null;
    let minDistance = Infinity;

    for (const lm of this.getLandmarks(true)) {
      if (lm.dimension !== dimension) continue;
      if (category && lm.category !== category) continue;

      const dist = Math.sqrt(
        Math.pow(pos.x - lm.position.x, 2) +
        Math.pow(pos.y - lm.position.y, 2) +
        Math.pow(pos.z - lm.position.z, 2)
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearest = lm;
      }
    }

    return nearest ? { landmark: nearest, distance: Math.round(minDistance * 10) / 10 } : null;
  }

  public recordRoute(
    name: string,
    startPos: BotCoordinates,
    endPos: BotCoordinates,
    dimension = "overworld",
    dangerScore = 1
  ): KnownRoute {
    const id = crypto.randomUUID();
    const cost = Math.round(
      Math.sqrt(
        Math.pow(startPos.x - endPos.x, 2) +
        Math.pow(startPos.y - endPos.y, 2) +
        Math.pow(startPos.z - endPos.z, 2)
      )
    );

    const route: KnownRoute = {
      id,
      name,
      startPos,
      endPos,
      dimension,
      estimatedCost: cost,
      dangerScore,
      lastTraversedAt: Date.now(),
      isVerified: true
    };

    this.knownRoutes.set(id, route);
    return route;
  }

  public getSnapshot(currentDimension = "overworld"): WorldIntelligenceSnapshot {
    const all = Array.from(this.dynamicLandmarks.values());
    const now = Date.now();
    let staleCount = 0;

    for (const lm of all) {
      if (now > lm.expiresAt) {
        lm.isStale = true;
        staleCount++;
      }
    }

    return {
      totalLandmarks: all.length,
      activeLandmarks: all.filter((l) => !l.isStale),
      staleLandmarksCount: staleCount,
      knownRoutesCount: this.knownRoutes.size,
      observedResourcesCount: this.observedResources.size,
      currentDimension,
      lastUpdated: now
    };
  }
}

export const worldIntelligence = new WorldIntelligenceEngine();

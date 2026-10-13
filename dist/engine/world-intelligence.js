import crypto from "node:crypto";
import { LandmarkRepo } from "../storage/database.js";
export class WorldIntelligenceEngine {
    dynamicLandmarks = new Map();
    observedResources = new Map();
    knownRoutes = new Map();
    constructor() {
        this.loadFromStorage();
    }
    loadFromStorage() {
        try {
            const dbLandmarks = LandmarkRepo.getAll();
            for (const lm of dbLandmarks) {
                this.dynamicLandmarks.set(lm.id, {
                    id: lm.id,
                    name: lm.name,
                    category: lm.category,
                    position: lm.coordinates,
                    dimension: lm.dimension || "overworld",
                    confidence: 1.0,
                    source: "previously_observed",
                    observedAt: lm.createdAt,
                    expiresAt: lm.createdAt + 86400000, // 24h default for permanent landmarks
                    isStale: false,
                    metadata: lm.description ? { description: lm.description } : undefined
                });
            }
        }
        catch { }
    }
    recordLandmark(name, category, position, dimension = "overworld", source = "currently_observed", ttlMs = 1800000, // 30 min default
    metadata) {
        const id = crypto.randomUUID();
        const now = Date.now();
        const landmark = {
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
                const dbCategory = ["home", "base", "mine", "farm", "storage", "portal"].includes(category)
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
            }
            catch { }
        }
        return landmark;
    }
    getLandmarks(filterStale = true) {
        const now = Date.now();
        const list = [];
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
    findNearest(pos, category, dimension = "overworld") {
        let nearest = null;
        let minDistance = Infinity;
        for (const lm of this.getLandmarks(true)) {
            if (lm.dimension !== dimension)
                continue;
            if (category && lm.category !== category)
                continue;
            const dist = Math.sqrt(Math.pow(pos.x - lm.position.x, 2) +
                Math.pow(pos.y - lm.position.y, 2) +
                Math.pow(pos.z - lm.position.z, 2));
            if (dist < minDistance) {
                minDistance = dist;
                nearest = lm;
            }
        }
        return nearest ? { landmark: nearest, distance: Math.round(minDistance * 10) / 10 } : null;
    }
    recordRoute(name, startPos, endPos, dimension = "overworld", dangerScore = 1) {
        const id = crypto.randomUUID();
        const cost = Math.round(Math.sqrt(Math.pow(startPos.x - endPos.x, 2) +
            Math.pow(startPos.y - endPos.y, 2) +
            Math.pow(startPos.z - endPos.z, 2)));
        const route = {
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
    getSnapshot(currentDimension = "overworld") {
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

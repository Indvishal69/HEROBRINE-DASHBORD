import crypto from "node:crypto";
import { AppSettingsRepo } from "../storage/database.js";
import { redactSecret } from "../storage/crypto.js";
export class EventTimelineEngine {
    events = [];
    MAX_EVENTS = 200;
    constructor() {
        this.events = AppSettingsRepo.get("timeline_events", []);
    }
    persist() {
        if (this.events.length > this.MAX_EVENTS) {
            this.events = this.events.slice(-this.MAX_EVENTS);
        }
        AppSettingsRepo.set("timeline_events", this.events);
    }
    record(event) {
        const full = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...event
        };
        this.events.push(full);
        this.persist();
        return full;
    }
    getEvents(category, limit = 50) {
        let list = this.events;
        if (category && category !== "all") {
            list = list.filter((e) => e.category === category);
        }
        return list.slice(-limit).reverse();
    }
    /**
     * Generates a sanitized export of event history with all secrets stripped
     */
    exportSanitizedDiagnostics() {
        const sanitized = this.events.map((e) => ({
            ...e,
            observationSummary: redactSecret(e.observationSummary),
            plannerDecision: redactSecret(e.plannerDecision),
            validatedAction: redactSecret(e.validatedAction),
            failureReason: e.failureReason ? redactSecret(e.failureReason) : undefined
        }));
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            totalEvents: sanitized.length,
            events: sanitized
        }, null, 2);
    }
}
export const eventTimeline = new EventTimelineEngine();

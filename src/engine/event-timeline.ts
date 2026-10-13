import crypto from "node:crypto";
import { AppSettingsRepo } from "../storage/database.js";
import { redactSecret } from "../storage/crypto.js";

export interface TimelineEvent {
  id: string;
  timestamp: number;
  taskId?: string;
  category: "movement" | "inventory" | "combat" | "building" | "food" | "ai" | "connection" | "permission";
  observationSummary: string;
  plannerDecision: string;
  validatedAction: string;
  result: "success" | "failure" | "aborted" | "in_progress";
  stateChanges?: Record<string, unknown>;
  failureReason?: string;
  recoveryDecision?: string;
}

export class EventTimelineEngine {
  private events: TimelineEvent[] = [];
  private readonly MAX_EVENTS = 200;

  constructor() {
    this.events = AppSettingsRepo.get<TimelineEvent[]>("timeline_events", []);
  }

  private persist(): void {
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }
    AppSettingsRepo.set("timeline_events", this.events);
  }

  public record(event: Omit<TimelineEvent, "id" | "timestamp">): TimelineEvent {
    const full: TimelineEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...event
    };

    this.events.push(full);
    this.persist();
    return full;
  }

  public getEvents(category?: string, limit = 50): TimelineEvent[] {
    let list = this.events;
    if (category && category !== "all") {
      list = list.filter((e) => e.category === category);
    }
    return list.slice(-limit).reverse();
  }

  /**
   * Generates a sanitized export of event history with all secrets stripped
   */
  public exportSanitizedDiagnostics(): string {
    const sanitized = this.events.map((e) => ({
      ...e,
      observationSummary: redactSecret(e.observationSummary),
      plannerDecision: redactSecret(e.plannerDecision),
      validatedAction: redactSecret(e.validatedAction),
      failureReason: e.failureReason ? redactSecret(e.failureReason) : undefined
    }));

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalEvents: sanitized.length,
        events: sanitized
      },
      null,
      2
    );
  }
}

export const eventTimeline = new EventTimelineEngine();

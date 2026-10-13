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
export declare class EventTimelineEngine {
    private events;
    private readonly MAX_EVENTS;
    constructor();
    private persist;
    record(event: Omit<TimelineEvent, "id" | "timestamp">): TimelineEvent;
    getEvents(category?: string, limit?: number): TimelineEvent[];
    /**
     * Generates a sanitized export of event history with all secrets stripped
     */
    exportSanitizedDiagnostics(): string;
}
export declare const eventTimeline: EventTimelineEngine;

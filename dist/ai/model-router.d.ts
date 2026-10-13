import type { AICredentialEntry } from "../types/ai.js";
export type TaskRoutingCategory = "command_interpretation" | "routine_planning" | "complex_campaign" | "vision_analysis" | "recovery_diagnostics";
export interface ModelRoutingPolicy {
    preferredProvider: string;
    fallbackProvider: string;
    maxCostPerCall: number;
    maxTokens: number;
}
export declare class AdaptiveModelRouter {
    private categoryPolicies;
    selectCredentialForTask(category: TaskRoutingCategory): AICredentialEntry | null;
    getPolicy(category: TaskRoutingCategory): ModelRoutingPolicy;
}
export declare const modelRouter: AdaptiveModelRouter;

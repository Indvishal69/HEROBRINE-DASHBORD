import { CredentialRepo } from "../storage/database.js";
import type { AICredentialEntry } from "../types/ai.js";

export type TaskRoutingCategory =
  | "command_interpretation"
  | "routine_planning"
  | "complex_campaign"
  | "vision_analysis"
  | "recovery_diagnostics";

export interface ModelRoutingPolicy {
  preferredProvider: string;
  fallbackProvider: string;
  maxCostPerCall: number;
  maxTokens: number;
}

export class AdaptiveModelRouter {
  private categoryPolicies: Record<TaskRoutingCategory, ModelRoutingPolicy> = {
    command_interpretation: {
      preferredProvider: "groq",
      fallbackProvider: "openrouter",
      maxCostPerCall: 0.002,
      maxTokens: 150
    },
    routine_planning: {
      preferredProvider: "groq",
      fallbackProvider: "openai",
      maxCostPerCall: 0.005,
      maxTokens: 500
    },
    complex_campaign: {
      preferredProvider: "openrouter",
      fallbackProvider: "openai",
      maxCostPerCall: 0.02,
      maxTokens: 1500
    },
    vision_analysis: {
      preferredProvider: "openai",
      fallbackProvider: "openrouter",
      maxCostPerCall: 0.03,
      maxTokens: 800
    },
    recovery_diagnostics: {
      preferredProvider: "openrouter",
      fallbackProvider: "groq",
      maxCostPerCall: 0.01,
      maxTokens: 800
    }
  };

  public selectCredentialForTask(category: TaskRoutingCategory): AICredentialEntry | null {
    const policy = this.categoryPolicies[category];
    const healthyCreds: AICredentialEntry[] = CredentialRepo.getAll().filter(
      (c: AICredentialEntry) => c.enabled && c.health !== "invalid_key" && c.health !== "quota_exceeded"
    );

    if (healthyCreds.length === 0) return null;

    // 1. Try to find preferred provider
    const preferred = healthyCreds.find((c: AICredentialEntry) => c.provider === policy.preferredProvider);
    if (preferred) return preferred;

    // 2. Try fallback provider
    const fallback = healthyCreds.find((c: AICredentialEntry) => c.provider === policy.fallbackProvider);
    if (fallback) return fallback;

    // 3. Return any healthy credential
    return healthyCreds[0];
  }

  public getPolicy(category: TaskRoutingCategory): ModelRoutingPolicy {
    return this.categoryPolicies[category];
  }
}

export const modelRouter = new AdaptiveModelRouter();

import { CredentialRepo } from "../storage/database.js";
export class AdaptiveModelRouter {
    categoryPolicies = {
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
    selectCredentialForTask(category) {
        const policy = this.categoryPolicies[category];
        const healthyCreds = CredentialRepo.getAll().filter((c) => c.enabled && c.health !== "invalid_key" && c.health !== "quota_exceeded");
        if (healthyCreds.length === 0)
            return null;
        // 1. Try to find preferred provider
        const preferred = healthyCreds.find((c) => c.provider === policy.preferredProvider);
        if (preferred)
            return preferred;
        // 2. Try fallback provider
        const fallback = healthyCreds.find((c) => c.provider === policy.fallbackProvider);
        if (fallback)
            return fallback;
        // 3. Return any healthy credential
        return healthyCreds[0];
    }
    getPolicy(category) {
        return this.categoryPolicies[category];
    }
}
export const modelRouter = new AdaptiveModelRouter();

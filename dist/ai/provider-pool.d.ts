import type { AIProviderPreset, AICredentialEntry, AIRuntimeConfig, AIProviderId } from "../types/ai.js";
export declare const PROVIDER_PRESETS: Record<AIProviderId, AIProviderPreset>;
export declare class AIProviderPool {
    private runtimeConfig;
    getConfig(): AIRuntimeConfig;
    updateConfig(patch: Partial<AIRuntimeConfig>): void;
    getPool(): AICredentialEntry[];
    testCredential(id: string): Promise<{
        ok: boolean;
        latencyMs: number;
        message: string;
    }>;
    completeChat(messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
    }>, systemOverride?: string): Promise<string>;
}
export declare const aiPool: AIProviderPool;

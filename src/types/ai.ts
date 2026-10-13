export type AIProviderId = 
  | "openrouter" 
  | "openai" 
  | "groq" 
  | "gemini"
  | "together" 
  | "fireworks" 
  | "custom";

export interface AIProviderPreset {
  id: AIProviderId;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: Array<{
    id: string;
    name: string;
    contextLength?: number;
    hasTools?: boolean;
    hasVision?: boolean;
    isFree?: boolean;
  }>;
}

export type CredentialHealth = "healthy" | "degraded" | "rate_limited" | "invalid_key" | "quota_exceeded" | "offline";

export interface AICredentialEntry {
  id: string;
  label: string;
  provider: AIProviderId;
  encryptedKey: string; // AES-256-GCM ciphertext
  iv: string;           // Initialization vector
  tag: string;          // Auth tag
  baseUrl: string;
  preferredModel: string;
  enabled: boolean;
  health: CredentialHealth;
  lastUsedAt?: number;
  lastSuccessAt?: number;
  lastErrorAt?: number;
  lastErrorMessage?: string;
  rateLimitResetAt?: number;
  requestsCount: number;
  failureCount: number;
  latencyAvgMs?: number;
  spendBudgetLimit?: number; // Optional limit
  currentSpendEstimated?: number;
}

export interface AIRuntimeConfig {
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
  reasoningEffort?: "low" | "medium" | "high";
  autoReply: boolean;
  triggerPrefix: string;
  mode: "event-driven" | "scheduled" | "task-driven";
}

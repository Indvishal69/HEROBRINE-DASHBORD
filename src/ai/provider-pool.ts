import crypto from "node:crypto";
import { CredentialRepo, AuditRepo } from "../storage/database.js";
import { decryptSecret, redactSecret } from "../storage/crypto.js";
import type { 
  AIProviderPreset, 
  AICredentialEntry, 
  AIRuntimeConfig, 
  AIProviderId, 
  CredentialHealth 
} from "../types/ai.js";

export const PROVIDER_PRESETS: Record<AIProviderId, AIProviderPreset> = {
  openrouter: {
    id: "openrouter",
    name: "OpenRouter (Recommended Hub)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "deepseek/deepseek-chat",
    models: [
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Fast & Intelligent)", contextLength: 64000, hasTools: true, isFree: false },
      { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (Free Tier)", contextLength: 1000000, hasTools: true, isFree: true },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", contextLength: 131072, hasTools: true, isFree: false },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", contextLength: 128000, hasTools: true, isFree: false },
      { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", contextLength: 200000, hasTools: true, isFree: false },
      { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct", contextLength: 32768, hasTools: true, isFree: false }
    ]
  },
  groq: {
    id: "groq",
    name: "Groq (Ultra-Low Latency LPU)",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", contextLength: 131072, hasTools: true, isFree: true },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", contextLength: 131072, hasTools: true, isFree: true },
      { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B", contextLength: 131072, hasTools: true, isFree: true },
      { id: "gemma2-9b-it", name: "Gemma 2 9B IT", contextLength: 8192, hasTools: false, isFree: true }
    ]
  },
  openai: {
    id: "openai",
    name: "OpenAI Direct",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini", contextLength: 128000, hasTools: true },
      { id: "gpt-4o", name: "GPT-4o", contextLength: 128000, hasTools: true },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", contextLength: 16385, hasTools: true }
    ]
  },
  together: {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", contextLength: 131072, hasTools: true },
      { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", name: "Llama 3.1 8B Turbo", contextLength: 131072, hasTools: true },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", contextLength: 64000, hasTools: true }
    ]
  },
  fireworks: {
    id: "fireworks",
    name: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: [
      { id: "accounts/fireworks/models/llama-v3p3-70b-instruct", name: "Llama 3.3 70B Instruct", contextLength: 131072, hasTools: true },
      { id: "accounts/fireworks/models/llama-v3p1-8b-instruct", name: "Llama 3.1 8B Instruct", contextLength: 131072, hasTools: true }
    ]
  },
  custom: {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    baseUrl: "",
    defaultModel: "",
    models: []
  }
};

export class AIProviderPool {
  private runtimeConfig: AIRuntimeConfig = {
    temperature: 0.7,
    maxTokens: 250,
    timeoutMs: 30000,
    maxRetries: 2,
    autoReply: true,
    triggerPrefix: "@nexus",
    mode: "event-driven"
  };

  public getConfig(): AIRuntimeConfig {
    return { ...this.runtimeConfig };
  }

  public updateConfig(patch: Partial<AIRuntimeConfig>): void {
    Object.assign(this.runtimeConfig, patch);
  }

  public getPool(): AICredentialEntry[] {
    return CredentialRepo.getAll();
  }

  public async testCredential(id: string): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const cred = CredentialRepo.get(id);
    if (!cred) throw new Error("Credential not found.");

    const rawKey = decryptSecret({ ciphertext: cred.encryptedKey, iv: cred.iv, tag: cred.tag });
    const startTime = Date.now();

    try {
      const response = await fetch(`${cred.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/minecraft-nexus-ai",
          "X-Title": "Minecraft Nexus AI"
        },
        body: JSON.stringify({
          model: cred.preferredModel,
          messages: [{ role: "user", content: "Reply with READY." }],
          max_tokens: 10
        }),
        signal: AbortSignal.timeout(15000)
      });

      const latencyMs = Date.now() - startTime;
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = String(data?.error?.message || data?.message || `HTTP ${response.status}`);
        cred.health = response.status === 401 ? "invalid_key" : response.status === 429 ? "rate_limited" : "degraded";
        cred.lastErrorAt = Date.now();
        cred.lastErrorMessage = errorMsg;
        cred.failureCount++;
        CredentialRepo.upsert(cred);
        return { ok: false, latencyMs, message: errorMsg };
      }

      cred.health = "healthy";
      cred.lastSuccessAt = Date.now();
      cred.lastErrorMessage = undefined;
      cred.latencyAvgMs = Math.round(cred.latencyAvgMs ? (cred.latencyAvgMs + latencyMs) / 2 : latencyMs);
      CredentialRepo.upsert(cred);

      return { ok: true, latencyMs, message: `Connected to ${cred.preferredModel} in ${latencyMs}ms` };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      cred.health = "offline";
      cred.lastErrorAt = Date.now();
      cred.lastErrorMessage = msg;
      cred.failureCount++;
      CredentialRepo.upsert(cred);
      return { ok: false, latencyMs, message: msg };
    }
  }

  public async completeChat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    systemOverride?: string
  ): Promise<string> {
    const pool = this.getPool().filter((c) => c.enabled);
    if (pool.length === 0) {
      throw new Error("No enabled AI credentials in pool. Configure an AI provider in the dashboard.");
    }

    // Sort by health (healthy first) and lowest requests count for round-robin balancing
    const sorted = pool.sort((a, b) => {
      const score = (h: CredentialHealth) => (h === "healthy" ? 0 : h === "degraded" ? 1 : h === "rate_limited" ? 2 : 3);
      if (score(a.health) !== score(b.health)) return score(a.health) - score(b.health);
      return a.requestsCount - b.requestsCount;
    });

    const now = Date.now();
    let lastError: Error | null = null;

    const requestMessages = systemOverride
      ? [{ role: "system" as const, content: systemOverride }, ...messages]
      : messages;

    for (const cred of sorted) {
      // Respect rate-limit reset cooldown
      if (cred.health === "rate_limited" && cred.rateLimitResetAt && cred.rateLimitResetAt > now) {
        continue;
      }

      // Check budget limit
      if (cred.spendBudgetLimit && cred.currentSpendEstimated && cred.currentSpendEstimated >= cred.spendBudgetLimit) {
        continue;
      }

      let rawKey: string;
      try {
        rawKey = decryptSecret({ ciphertext: cred.encryptedKey, iv: cred.iv, tag: cred.tag });
      } catch (e) {
        console.error(`[AIPool] Failed to decrypt key for ${cred.label}`);
        continue;
      }

      let modelToUse = cred.preferredModel;
      const startTime = Date.now();

      for (let attempt = 0; attempt <= this.runtimeConfig.maxRetries; attempt++) {
        try {
          const res = await fetch(`${cred.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${rawKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://github.com/minecraft-nexus-ai",
              "X-Title": "Minecraft Nexus AI"
            },
            body: JSON.stringify({
              model: modelToUse,
              messages: requestMessages,
              max_tokens: this.runtimeConfig.maxTokens,
              temperature: this.runtimeConfig.temperature
            }),
            signal: AbortSignal.timeout(this.runtimeConfig.timeoutMs)
          });

          const latencyMs = Date.now() - startTime;
          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            const errorMsg = String(data?.error?.message || data?.message || `HTTP ${res.status}`);

            // Groq 404/400 model auto-failover
            if ((res.status === 404 || res.status === 400) && cred.provider === "groq") {
              const fallback = modelToUse === "llama-3.3-70b-versatile" ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
              console.error(`[AIPool] Model ${modelToUse} failed (${errorMsg}). Trying fallback ${fallback}...`);
              modelToUse = fallback;
              continue;
            }

            if (res.status === 429) {
              const retryAfterSec = Number(res.headers.get("retry-after") || 60);
              cred.health = "rate_limited";
              cred.rateLimitResetAt = Date.now() + retryAfterSec * 1000;
              cred.lastErrorAt = Date.now();
              cred.lastErrorMessage = `Rate limited: ${errorMsg}`;
              cred.failureCount++;
              CredentialRepo.upsert(cred);
              lastError = new Error(`Rate limit on ${cred.label}: ${errorMsg}`);
              break; // Try next credential
            }

            if (res.status === 401 || res.status === 403) {
              cred.health = "invalid_key";
              cred.lastErrorAt = Date.now();
              cred.lastErrorMessage = errorMsg;
              cred.failureCount++;
              CredentialRepo.upsert(cred);
              lastError = new Error(`Authentication error on ${cred.label}: ${errorMsg}`);
              break; // Permanent, try next credential
            }

            // Transient 5xx error
            if (res.status >= 500 && attempt < this.runtimeConfig.maxRetries) {
              const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }

            cred.health = "degraded";
            cred.lastErrorAt = Date.now();
            cred.lastErrorMessage = errorMsg;
            cred.failureCount++;
            CredentialRepo.upsert(cred);
            lastError = new Error(`Provider ${cred.label} error: ${errorMsg}`);
            break;
          }

          // Successful completion
          const content = data?.choices?.[0]?.message?.content;
          const text = typeof content === "string" ? content.trim() : "";
          if (!text) throw new Error("AI returned an empty message.");

          cred.health = "healthy";
          cred.lastSuccessAt = Date.now();
          cred.lastUsedAt = Date.now();
          cred.lastErrorMessage = undefined;
          cred.requestsCount++;
          cred.latencyAvgMs = Math.round(cred.latencyAvgMs ? (cred.latencyAvgMs + latencyMs) / 2 : latencyMs);
          
          // Estimate tokens spend
          const totalTokens = (data?.usage?.total_tokens as number) || 200;
          cred.currentSpendEstimated = (cred.currentSpendEstimated || 0) + (totalTokens * 0.000001);
          CredentialRepo.upsert(cred);

          return text;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt === this.runtimeConfig.maxRetries) {
            cred.failureCount++;
            cred.lastErrorAt = Date.now();
            cred.lastErrorMessage = msg;
            CredentialRepo.upsert(cred);
            lastError = new Error(`Connection failed on ${cred.label}: ${msg}`);
          }
        }
      }
    }

    throw lastError || new Error("All active AI credentials in the pool failed.");
  }
}

export const aiPool = new AIProviderPool();

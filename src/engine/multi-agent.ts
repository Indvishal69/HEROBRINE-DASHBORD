import { AppSettingsRepo } from "../storage/database.js";

export interface TaskLeaseRecord {
  taskId: string;
  leasedToBotId: string;
  leasedAt: number;
  expiresAt: number;
}

export class MultiAgentManager {
  private botId: string;

  constructor() {
    this.botId = process.env.BOT_INSTANCE_ID || "nexus-bot-primary";
  }

  public getBotId(): string {
    return this.botId;
  }

  public acquireTaskLease(taskId: string, leaseDurationMs = 60000): { acquired: boolean; leasedBy: string } {
    const leases = AppSettingsRepo.get<Record<string, TaskLeaseRecord>>("task_leases", {});
    const now = Date.now();
    const existing = leases[taskId];

    if (existing && existing.leasedToBotId !== this.botId && now < existing.expiresAt) {
      // Leased to another bot and not yet expired
      return { acquired: false, leasedBy: existing.leasedToBotId };
    }

    // Grant lease
    leases[taskId] = {
      taskId,
      leasedToBotId: this.botId,
      leasedAt: now,
      expiresAt: now + leaseDurationMs
    };
    AppSettingsRepo.set("task_leases", leases);
    return { acquired: true, leasedBy: this.botId };
  }

  public releaseTaskLease(taskId: string): void {
    const leases = AppSettingsRepo.get<Record<string, TaskLeaseRecord>>("task_leases", {});
    if (leases[taskId] && leases[taskId].leasedToBotId === this.botId) {
      delete leases[taskId];
      AppSettingsRepo.set("task_leases", leases);
    }
  }

  public isLeaseActive(taskId: string): boolean {
    const leases = AppSettingsRepo.get<Record<string, TaskLeaseRecord>>("task_leases", {});
    const now = Date.now();
    const existing = leases[taskId];
    return Boolean(existing && now < existing.expiresAt);
  }
}

export const multiAgentManager = new MultiAgentManager();

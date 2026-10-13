export type ActionType = "movement" | "item_use" | "all";

export interface ActionOwnerInfo {
  owner: string;
  priority: number; // 1 (Highest: Emergency) -> 6 (Lowest: Routine Task)
  actionType: ActionType;
  acquiredAt: number;
}

export class ActionCoordinator {
  private currentOwner: ActionOwnerInfo | null = null;
  private preemptionListeners: Array<(preemptedOwner: string, newOwner: string) => void> = [];

  // Priorities:
  // 1: Emergency Survival (Critical health/danger)
  // 2: Manual Browser Control (Exclusive user override)
  // 3: Combat Recovery (Healing/disengaging in combat)
  // 4: Combat Engagement (PVP/PVE targeting)
  // 5: Routine Hunger (Auto-eating when not in combat)
  // 6: Task Executor (Mining, building, farming, crafting)
  public static readonly PRIORITY_EMERGENCY = 1;
  public static readonly PRIORITY_MANUAL = 2;
  public static readonly PRIORITY_COMBAT_RECOVERY = 3;
  public static readonly PRIORITY_COMBAT = 4;
  public static readonly PRIORITY_ROUTINE_EAT = 5;
  public static readonly PRIORITY_TASK = 6;

  public requestAction(
    owner: string,
    priority: number,
    actionType: ActionType = "all"
  ): boolean {
    const now = Date.now();

    // If currently locked by the same owner, allow/refresh
    if (this.currentOwner && this.currentOwner.owner === owner) {
      this.currentOwner.priority = priority;
      this.currentOwner.actionType = actionType;
      this.currentOwner.acquiredAt = now;
      return true;
    }

    // If locked by someone else
    if (this.currentOwner) {
      // Lower numerical value = higher priority
      if (priority < this.currentOwner.priority) {
        const previous = this.currentOwner.owner;
        this.notifyPreemption(previous, owner);
        this.currentOwner = {
          owner,
          priority,
          actionType,
          acquiredAt: now
        };
        return true;
      }
      // If lock has lasted for > 15 seconds without release, consider it timed out
      if (now - this.currentOwner.acquiredAt > 15000) {
        const previous = this.currentOwner.owner;
        this.notifyPreemption(previous, owner);
        this.currentOwner = {
          owner,
          priority,
          actionType,
          acquiredAt: now
        };
        return true;
      }
      return false;
    }

    // No lock exists
    this.currentOwner = {
      owner,
      priority,
      actionType,
      acquiredAt: now
    };
    return true;
  }

  public releaseAction(owner: string): boolean {
    if (this.currentOwner && this.currentOwner.owner === owner) {
      this.currentOwner = null;
      return true;
    }
    return false;
  }

  public forceReleaseAll(): void {
    this.currentOwner = null;
  }

  public isOwnedBy(owner: string): boolean {
    return this.currentOwner !== null && this.currentOwner.owner === owner;
  }

  public getCurrentOwner(): string | null {
    return this.currentOwner ? this.currentOwner.owner : null;
  }

  public getCurrentPriority(): number | null {
    return this.currentOwner ? this.currentOwner.priority : null;
  }

  public onPreempted(listener: (preemptedOwner: string, newOwner: string) => void): void {
    this.preemptionListeners.push(listener);
  }

  private notifyPreemption(preempted: string, newOwner: string): void {
    for (const listener of this.preemptionListeners) {
      try {
        listener(preempted, newOwner);
      } catch {}
    }
  }
}

export const actionCoordinator = new ActionCoordinator();

export class ActionCoordinator {
    currentOwner = null;
    preemptionListeners = [];
    // Priorities:
    // 1: Emergency Survival (Critical health/danger)
    // 2: Manual Browser Control (Exclusive user override)
    // 3: Combat Recovery (Healing/disengaging in combat)
    // 4: Combat Engagement (PVP/PVE targeting)
    // 5: Routine Hunger (Auto-eating when not in combat)
    // 6: Task Executor (Mining, building, farming, crafting)
    static PRIORITY_EMERGENCY = 1;
    static PRIORITY_MANUAL = 2;
    static PRIORITY_COMBAT_RECOVERY = 3;
    static PRIORITY_COMBAT = 4;
    static PRIORITY_ROUTINE_EAT = 5;
    static PRIORITY_TASK = 6;
    requestAction(owner, priority, actionType = "all") {
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
    releaseAction(owner) {
        if (this.currentOwner && this.currentOwner.owner === owner) {
            this.currentOwner = null;
            return true;
        }
        return false;
    }
    forceReleaseAll() {
        this.currentOwner = null;
    }
    isOwnedBy(owner) {
        return this.currentOwner !== null && this.currentOwner.owner === owner;
    }
    getCurrentOwner() {
        return this.currentOwner ? this.currentOwner.owner : null;
    }
    getCurrentPriority() {
        return this.currentOwner ? this.currentOwner.priority : null;
    }
    onPreempted(listener) {
        this.preemptionListeners.push(listener);
    }
    notifyPreemption(preempted, newOwner) {
        for (const listener of this.preemptionListeners) {
            try {
                listener(preempted, newOwner);
            }
            catch { }
        }
    }
}
export const actionCoordinator = new ActionCoordinator();

export type ActionType = "movement" | "item_use" | "all";
export interface ActionOwnerInfo {
    owner: string;
    priority: number;
    actionType: ActionType;
    acquiredAt: number;
}
export declare class ActionCoordinator {
    private currentOwner;
    private preemptionListeners;
    static readonly PRIORITY_EMERGENCY = 1;
    static readonly PRIORITY_MANUAL = 2;
    static readonly PRIORITY_COMBAT_RECOVERY = 3;
    static readonly PRIORITY_COMBAT = 4;
    static readonly PRIORITY_ROUTINE_EAT = 5;
    static readonly PRIORITY_TASK = 6;
    requestAction(owner: string, priority: number, actionType?: ActionType): boolean;
    releaseAction(owner: string): boolean;
    forceReleaseAll(): void;
    isOwnedBy(owner: string): boolean;
    getCurrentOwner(): string | null;
    getCurrentPriority(): number | null;
    onPreempted(listener: (preemptedOwner: string, newOwner: string) => void): void;
    private notifyPreemption;
}
export declare const actionCoordinator: ActionCoordinator;

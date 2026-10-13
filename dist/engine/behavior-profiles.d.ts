export interface BehaviorProfile {
    id: string;
    name: string;
    description: string;
    chatty: boolean;
    autoHarvest: boolean;
    autoEatThreshold: number;
    survivalPriority: number;
    explorationRadius: number;
}
export declare const BEHAVIOR_PROFILES: Record<string, BehaviorProfile>;

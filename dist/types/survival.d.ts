export type SurvivalPriority = "A_CRITICAL" | "B_COMBAT_RECOVERY" | "C_ROUTINE_HUNGER" | "D_LONG_TERM";
export type RecoveryState = "IDLE" | "ASSESSING" | "RETREATING" | "RECOVERING" | "RESTOCKING" | "RESUMING";
export type FoodPreferenceProfile = "optimal_saturation" | "balanced" | "resource_saving" | "carnivore" | "vegetarian";
export interface FoodItemMeta {
    name: string;
    foodPoints: number;
    saturation: number;
    isNegative?: boolean;
    isRare?: boolean;
}
export interface FoodInventoryEntry {
    name: string;
    count: number;
    foodPoints: number;
    saturation: number;
    score: number;
    isBanned: boolean;
    isRare: boolean;
}
export interface FoodConsumptionResult {
    id: string;
    timestamp: number;
    foodName: string;
    foodLevelBefore: number;
    foodLevelAfter: number;
    saturationBefore?: number;
    saturationAfter?: number;
    durationMs: number;
    success: boolean;
    error?: string;
}
export interface SurvivalConfig {
    autoEatEnabled: boolean;
    routineHungerThreshold: number;
    sprintHungerThreshold: number;
    emergencyHealthThreshold: number;
    bannedFoods: string[];
    preferenceProfile: FoodPreferenceProfile;
    minFoodReserveStack: number;
    preserveRareConsumables: boolean;
    restockThreshold: number;
}
export interface SurvivalSnapshot {
    autoEatEnabled: boolean;
    currentPriority: SurvivalPriority | null;
    recoveryState: RecoveryState;
    health: number;
    food: number;
    saturation: number;
    isEating: boolean;
    currentEatingItem: string | null;
    totalFoodItems: number;
    foodInventory: FoodInventoryEntry[];
    lastEatResult: FoodConsumptionResult | null;
    actionOwner: string | null;
    warning: string | null;
}

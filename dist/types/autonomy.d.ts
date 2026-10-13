export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type CapabilityStatus = "implemented_tested" | "implemented_with_limitations" | "disabled" | "unsupported_configuration" | "missing_dependency" | "not_implemented";
export interface CapabilityRecord {
    id: string;
    name: string;
    category: "core" | "combat" | "survival" | "building" | "world" | "ai" | "economy" | "social";
    status: CapabilityStatus;
    description: string;
    minAutonomyLevel: AutonomyLevel;
    requiredVersion?: string;
    requiredPlugins?: string[];
    limitations?: string[];
    lastTestedAt?: number;
}
export interface AutonomyConfig {
    currentLevel: AutonomyLevel;
    maxUnattendedHours: number;
    quietHoursEnabled: boolean;
    quietHoursStart: number;
    quietHoursEnd: number;
    allowDestructiveActions: boolean;
    requireAdminConfirmationForRollbacks: boolean;
    personality: PersonalityProfile;
}
export type PersonalityProfile = "casual" | "resource_specialist" | "builder" | "explorer" | "farmer" | "combat_specialist" | "guardian" | "social" | "economy_manager" | "balanced";

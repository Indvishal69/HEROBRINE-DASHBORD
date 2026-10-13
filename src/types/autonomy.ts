export type AutonomyLevel = 
  | 0 // LEVEL 0 — OBSERVE: Gather observations, explain possible actions, no world modifications
  | 1 // LEVEL 1 — ASSIST: Low-risk tasks only after explicit requests
  | 2 // LEVEL 2 — AUTONOMOUS SURVIVAL: Manage routine survival, hunger, equipment, gathering
  | 3 // LEVEL 3 — AUTONOMOUS PROJECTS: Complete mining, farming, blueprint construction, storage
  | 4 // LEVEL 4 — ADVANCED SMP COMPANION: Multi-stage campaigns, safe exploration, chat requests, recovery
  | 5; // LEVEL 5 — OWNER-CONFIGURED EXPERT: Boss prep, nether/end travel, approved PvP under strict budgets

export type CapabilityStatus =
  | "implemented_tested"
  | "implemented_with_limitations"
  | "disabled"
  | "unsupported_configuration"
  | "missing_dependency"
  | "not_implemented";

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
  quietHoursStart: number; // 0-23
  quietHoursEnd: number;   // 0-23
  allowDestructiveActions: boolean;
  requireAdminConfirmationForRollbacks: boolean;
  personality: PersonalityProfile;
}

export type PersonalityProfile =
  | "casual"
  | "resource_specialist"
  | "builder"
  | "explorer"
  | "farmer"
  | "combat_specialist"
  | "guardian"
  | "social"
  | "economy_manager"
  | "balanced";

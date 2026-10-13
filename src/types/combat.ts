import type { BotCoordinates } from "./bot.js";

export type CombatMode =
  | "disabled"
  | "defensive"
  | "approved_duel"
  | "owner_authorized"
  | "practice"
  | "custom";

export type CombatState =
  | "IDLE"
  | "TARGET_VALIDATION"
  | "PREPARATION"
  | "ENGAGE"
  | "DEFEND_OR_REPOSITION"
  | "RECOVERY"
  | "RESUME_OR_DISENGAGE";

export interface CombatTarget {
  id: number;
  username: string;
  entityType: string;
  isPlayer: boolean;
  position: BotCoordinates;
  distance: number;
  lastSeenAt: number;
  lineOfSight: boolean;
  healthEstimate?: number;
}

export interface CombatConfig {
  enabled: boolean;
  mode: CombatMode;
  approvedTargets: string[];
  protectedPlayers: string[];
  currentDuelOpponent: string | null;
  minHealthRetreatThreshold: number; // e.g. 7 (out of 20)
  maxEngagementDistance: number;    // e.g. 16 blocks
  preferredWeapon: "sword" | "axe" | "auto";
  allowShield: boolean;
  allowRareConsumables: boolean;     // Golden apples, totems
  attackCooldownMs: number;          // Default ~625ms for 1.21.x sword
  strafeEnabled: boolean;
}

export interface CombatSnapshot {
  state: CombatState;
  mode: CombatMode;
  enabled: boolean;
  hasTarget: boolean;
  target: CombatTarget | null;
  selectedWeapon: string | null;
  weaponDurability: { current: number; max: number } | null;
  offhandItem: string | null;
  distanceToTarget: number | null;
  lineOfSight: boolean;
  recentDamageTaken: number;
  lastCombatEvent: string | null;
  lastActionTimestamp: number;
  isRetreating: boolean;
  staleTarget: boolean;
}

export interface CombatEventRecord {
  id: string;
  timestamp: number;
  type: "engage" | "hit" | "defend" | "reposition" | "retreat" | "disengage" | "victory" | "defeated" | "target_lost" | "error";
  targetName?: string;
  details: string;
  damage?: number;
}

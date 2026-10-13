export type BotConnectionState = 
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "loading"
  | "connected"
  | "recovering"
  | "stopped"
  | "error";

export interface BotCoordinates {
  x: number;
  y: number;
  z: number;
}

export interface BotVitals {
  health: number;
  food: number;
  saturation?: number;
  oxygen?: number;
  isAlive: boolean;
  isSleeping: boolean;
  dimension: string;
}

export interface InventoryItem {
  slot: number;
  name: string;
  count: number;
  displayName?: string;
  durabilityUsed?: number;
  maxDurability?: number;
}

export interface EquipmentSnapshot {
  head: string | null;
  torso: string | null;
  legs: string | null;
  feet: string | null;
  offhand: string | null;
  mainhand: string | null;
}

export interface EntitySnapshot {
  id: number;
  name: string;
  type: string;
  kind?: string;
  position: BotCoordinates;
  distance: number;
  isHostile: boolean;
}

export interface DroppedItemSnapshot {
  id: number;
  name: string;
  count: number;
  position: BotCoordinates;
  distance: number;
}

export interface BlockObservation {
  name: string;
  position: BotCoordinates;
  distance: number;
  harvestable: boolean;
}

export interface WorldSnapshot {
  timestamp: number;
  state: BotConnectionState;
  username: string;
  position: BotCoordinates;
  yaw: number;
  pitch: number;
  dimension: string;
  vitals: BotVitals;
  activeTask: string | null;
  activeSlot: number;
  heldItem: string | null;
  equipment: EquipmentSnapshot;
  inventory: InventoryItem[];
  hotbar: InventoryItem[];
  nearbyEntities: EntitySnapshot[];
  nearbyPlayers: Array<{ name: string; position: BotCoordinates; distance: number }>;
  nearbyDrops: DroppedItemSnapshot[];
  latencyMs?: number;
  serverAddress: string;
  serverVersion: string;
}

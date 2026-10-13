import type { BotCoordinates } from "./bot.js";

export type LandmarkCategory = "home" | "base" | "mine" | "farm" | "storage" | "portal" | "poi";

export interface LandmarkRecord {
  id: string;
  name: string;
  category: LandmarkCategory;
  coordinates: BotCoordinates;
  dimension: string;
  description?: string;
  tags: string[];
  createdAt: number;
}

export interface ContainerMemoryRecord {
  id: string;
  coordinates: BotCoordinates;
  dimension: string;
  containerType: "chest" | "double_chest" | "barrel" | "shulker_box";
  itemsSummary: Record<string, number>; // itemName -> count
  lastInspectedAt: number;
}

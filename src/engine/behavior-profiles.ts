export interface BehaviorProfile {
  id: string;
  name: string;
  description: string;
  chatty: boolean;
  autoHarvest: boolean;
  autoEatThreshold: number; // food level (e.g. 15)
  survivalPriority: number; // 1-10
  explorationRadius: number;
}

export const BEHAVIOR_PROFILES: Record<string, BehaviorProfile> = {
  casual: {
    id: "casual",
    name: "Casual Survivor",
    description: "Balanced natural behavior, keeps hunger full, guards home, chats when spoken to.",
    chatty: true,
    autoHarvest: true,
    autoEatThreshold: 15,
    survivalPriority: 8,
    explorationRadius: 32
  },
  builder: {
    id: "builder",
    name: "Helpful Builder",
    description: "Focuses on gathering building materials and constructing blueprints without distraction.",
    chatty: false,
    autoHarvest: false,
    autoEatThreshold: 14,
    survivalPriority: 7,
    explorationRadius: 16
  },
  explorer: {
    id: "explorer",
    name: "Explorer",
    description: "Scouts new terrain, identifies landmarks, marks points of interest.",
    chatty: true,
    autoHarvest: false,
    autoEatThreshold: 16,
    survivalPriority: 9,
    explorationRadius: 64
  },
  farmer: {
    id: "farmer",
    name: "Farmer",
    description: "Continuously scans for ripe wheat, carrots, and potatoes, harvesting and replanting.",
    chatty: false,
    autoHarvest: true,
    autoEatThreshold: 15,
    survivalPriority: 6,
    explorationRadius: 24
  },
  miner: {
    id: "miner",
    name: "Miner",
    description: "Prioritizes digging ores, managing tool durability, and collecting dropped resources.",
    chatty: false,
    autoHarvest: false,
    autoEatThreshold: 15,
    survivalPriority: 8,
    explorationRadius: 32
  },
  manager: {
    id: "manager",
    name: "Resource Manager",
    description: "Sorts chests, clears inventory, ensures items are stored in appropriate containers.",
    chatty: true,
    autoHarvest: true,
    autoEatThreshold: 15,
    survivalPriority: 6,
    explorationRadius: 16
  },
  quiet: {
    id: "quiet",
    name: "Quiet Companion",
    description: "Follows player quietly, stays close, avoids speaking unless given direct commands.",
    chatty: false,
    autoHarvest: false,
    autoEatThreshold: 14,
    survivalPriority: 7,
    explorationRadius: 16
  }
};

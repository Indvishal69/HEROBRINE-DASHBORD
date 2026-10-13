import type { Bot } from "mineflayer";
import type { BotCoordinates } from "../types/bot.js";
import { AppSettingsRepo, AuditRepo } from "../storage/database.js";
import crypto from "node:crypto";

export interface VillagerTradeOffer {
  id: string;
  inputItem1: string;
  inputCount1: number;
  inputItem2?: string;
  inputCount2?: number;
  outputItem: string;
  outputCount: number;
  usesRemaining: number;
  maxUses: number;
  isProfitable: boolean;
  requiresOwnerApproval: boolean;
}

export interface DiscoveredVillager {
  id: number;
  profession: string;
  level: number;
  position: BotCoordinates;
  distance: number;
  offers: VillagerTradeOffer[];
}

export class EconomyManager {
  public getProtectedTradeItems(): string[] {
    return AppSettingsRepo.get<string[]>("protected_trade_items", [
      "diamond",
      "diamond_block",
      "netherite_ingot",
      "netherite_scrap",
      "totem_of_undying",
      "enchanted_golden_apple"
    ]);
  }

  public discoverNearbyVillagers(bot: Bot | null): DiscoveredVillager[] {
    if (!bot || !bot.entity) return [];

    const villagers: DiscoveredVillager[] = [];
    const protectedItems = this.getProtectedTradeItems();

    for (const entity of Object.values(bot.entities)) {
      if (!entity || !entity.position) continue;
      const isVillager = entity.name === "villager" || (entity as any).type === "villager";
      if (!isVillager) continue;

      const dist = Math.round(bot.entity.position.distanceTo(entity.position) * 10) / 10;
      if (dist > 16) continue;

      // Mocked trade representation if entity has metadata or fallback trade template
      const mockOffers: VillagerTradeOffer[] = [
        {
          id: `${entity.id}-1`,
          inputItem1: "emerald",
          inputCount1: 1,
          outputItem: "bread",
          outputCount: 6,
          usesRemaining: 12,
          maxUses: 16,
          isProfitable: true,
          requiresOwnerApproval: false
        },
        {
          id: `${entity.id}-2`,
          inputItem1: "wheat",
          inputCount1: 20,
          outputItem: "emerald",
          outputCount: 1,
          usesRemaining: 16,
          maxUses: 16,
          isProfitable: true,
          requiresOwnerApproval: false
        }
      ];

      villagers.push({
        id: entity.id,
        profession: (entity as any).metadata?.[18] || "farmer",
        level: 1,
        position: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
        distance: dist,
        offers: mockOffers
      });
    }

    return villagers;
  }

  public validateTradeFeasibility(
    bot: Bot,
    offer: VillagerTradeOffer
  ): { feasible: boolean; reason: string } {
    const protectedItems = this.getProtectedTradeItems();

    // Check protected resources
    if (protectedItems.includes(offer.inputItem1) || (offer.inputItem2 && protectedItems.includes(offer.inputItem2))) {
      return {
        feasible: false,
        reason: `Trade consumes protected high-value resource (${offer.inputItem1}). Owner authorization required.`
      };
    }

    // Check bot inventory
    const count1 = bot.inventory.items()
      .filter((i) => i.name === offer.inputItem1)
      .reduce((acc, i) => acc + i.count, 0);

    if (count1 < offer.inputCount1) {
      return {
        feasible: false,
        reason: `Insufficient materials: have ${count1}x ${offer.inputItem1}, need ${offer.inputCount1}x.`
      };
    }

    return {
      feasible: true,
      reason: `Trade validated: ${count1}x ${offer.inputItem1} available in inventory.`
    };
  }
}

export const economyManager = new EconomyManager();

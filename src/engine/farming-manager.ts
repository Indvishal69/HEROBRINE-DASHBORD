import type { Bot } from "mineflayer";
import vec3pkg from "vec3";
const Vec3: any = (vec3pkg as any).Vec3 || vec3pkg;
import pathfinderPackage from "mineflayer-pathfinder";

const { goals } = pathfinderPackage;
const { GoalNear } = goals;

const SEED_MAP: Record<string, string> = {
  wheat: "wheat_seeds",
  carrots: "carrot",
  potatoes: "potato",
  beetroots: "beetroot_seeds"
};

export class FarmingManager {
  public async harvestAndReplant(
    bot: Bot,
    radius = 16,
    replant = true,
    onProgress?: (harvested: number) => void
  ): Promise<{ harvestedCount: number }> {
    if (!bot || !bot.entity) throw new Error("Bot is offline.");

    let harvestedCount = 0;

    // Find ripe crops
    const cropPositions = bot.findBlocks({
      matching: (b) => {
        if (!b) return false;
        // In Minecraft 1.21: wheat/carrots/potatoes metadata/age 7 = mature, beetroots age 3
        const age = (b as any)._properties?.age || (b as any).getProperties?.()?.age;
        if (b.name === "wheat" && age === "7") return true;
        if (b.name === "carrots" && age === "7") return true;
        if (b.name === "potatoes" && age === "7") return true;
        if (b.name === "beetroots" && age === "3") return true;
        return false;
      },
      maxDistance: radius,
      count: 20
    });

    if (cropPositions.length === 0) {
      return { harvestedCount: 0 };
    }

    for (const pos of cropPositions) {
      const block = bot.blockAt(pos);
      if (!block) continue;
      const cropType = block.name;

      // Navigate within 3 blocks
      if (bot.pathfinder && bot.entity.position.distanceTo(pos) > 3) {
        try {
          await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 2));
        } catch {
          continue;
        }
      }

      // Dig the mature crop
      if (bot.canDigBlock(block)) {
        try {
          await bot.dig(block);
          harvestedCount++;
          onProgress?.(harvestedCount);

          // Replant if configured
          if (replant) {
            const seedName = SEED_MAP[cropType] || "wheat_seeds";
            const seedItem = bot.inventory.items().find((i) => i.name === seedName);
            const soilBlock = bot.blockAt(pos.offset(0, -1, 0));

            if (seedItem && soilBlock && soilBlock.name === "farmland") {
              await bot.equip(seedItem, "hand");
              await bot.placeBlock(soilBlock, new Vec3(0, 1, 0));
            }
          }
        } catch {}
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return { harvestedCount };
  }
}

export const farming = new FarmingManager();

import type { Bot } from "mineflayer";
import Vec3 from "vec3";
import pathfinderPackage from "mineflayer-pathfinder";

const { goals } = pathfinderPackage;
const { GoalNear } = goals;

const TOOL_AFFINITY: Record<string, string[]> = {
  axe: ["log", "wood", "planks", "fence", "crafting_table"],
  pickaxe: ["stone", "ore", "cobblestone", "iron", "gold", "diamond", "coal", "brick"],
  shovel: ["dirt", "sand", "gravel", "clay", "grass_block"]
};

export class MiningManager {
  public async mineResource(
    bot: Bot,
    resourceQuery: string,
    targetCount = 8,
    onProgress?: (collected: number, total: number) => void
  ): Promise<{ collected: number; resource: string }> {
    if (!bot || !bot.entity) throw new Error("Bot is offline.");

    const query = resourceQuery.toLowerCase();
    let collected = 0;

    for (let i = 0; i < targetCount; i++) {
      // Find matching nearby block
      const blocks = bot.findBlocks({
        matching: (b) => {
          if (!b || b.name === "air" || b.name.includes("water") || b.name.includes("lava")) return false;
          if (query === "wood" || query === "log") return b.name.includes("_log") || b.name.includes("_wood");
          return b.name.includes(query);
        },
        maxDistance: 24,
        count: 5
      });

      if (blocks.length === 0) {
        if (collected > 0) return { collected, resource: query };
        throw new Error(`No reachable ${query} blocks found nearby.`);
      }

      const targetPos = blocks[0];
      const targetBlock = bot.blockAt(targetPos);
      if (!targetBlock) continue;

      // Navigate within 4 blocks
      if (bot.entity.position.distanceTo(targetPos) > 4) {
        if (bot.pathfinder) {
          try {
            await bot.pathfinder.goto(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 3));
          } catch {
            // Path obstructed, try next
            continue;
          }
        }
      }

      // Equip appropriate tool
      await this.equipSuitableTool(bot, targetBlock.name);

      // Dig block
      if (bot.canDigBlock(targetBlock)) {
        try {
          await bot.dig(targetBlock);
          collected++;
          onProgress?.(collected, targetCount);

          // Step slightly forward to collect drop
          if (bot.pathfinder) {
            try {
              await bot.pathfinder.goto(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
            } catch {}
          }
        } catch (e) {
          // Dig cancelled or tool broke
        }
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    return { collected, resource: query };
  }

  private async equipSuitableTool(bot: Bot, blockName: string): Promise<void> {
    for (const [toolType, targets] of Object.entries(TOOL_AFFINITY)) {
      if (targets.some((t) => blockName.includes(t))) {
        const tool = bot.inventory.items().find((i) => i.name.includes(toolType));
        if (tool) {
          try {
            await bot.equip(tool, "hand");
            return;
          } catch {}
        }
      }
    }
  }
}

export const mining = new MiningManager();

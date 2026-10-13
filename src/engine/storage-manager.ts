import type { Bot } from "mineflayer";
import Vec3 from "vec3";
import pathfinderPackage from "mineflayer-pathfinder";

const { goals } = pathfinderPackage;
const { GoalNear } = goals;

export class StorageManager {
  public async depositCategory(
    bot: Bot,
    category: "ores" | "blocks" | "drops" | "all_except_hotbar"
  ): Promise<{ depositedCount: number }> {
    if (!bot || !bot.entity) throw new Error("Bot is offline.");

    // Find nearest chest or barrel
    const containerBlock = bot.findBlock({
      matching: (b) => b.name === "chest" || b.name === "barrel" || b.name === "trapped_chest",
      maxDistance: 16
    });

    if (!containerBlock) {
      throw new Error("No chest or storage container found within 16 blocks.");
    }

    // Walk to chest
    if (bot.pathfinder && bot.entity.position.distanceTo(containerBlock.position) > 3) {
      await bot.pathfinder.goto(
        new GoalNear(containerBlock.position.x, containerBlock.position.y, containerBlock.position.z, 2)
      );
    }

    const container = await bot.openContainer(containerBlock);
    let depositedCount = 0;

    try {
      const items = bot.inventory.items();
      for (const item of items) {
        // Skip hotbar items (slots 36 to 44) if category is all_except_hotbar
        if (category === "all_except_hotbar" && item.slot >= 36 && item.slot <= 44) {
          continue;
        }

        let shouldDeposit = false;
        if (category === "ores") {
          shouldDeposit = /ore|ingot|raw_|diamond|emerald|coal|lapis|redstone/i.test(item.name);
        } else if (category === "blocks") {
          shouldDeposit = /stone|dirt|cobble|planks|log|wood|sand|gravel|granite|diorite|andesite/i.test(item.name);
        } else if (category === "drops") {
          shouldDeposit = /bone|string|rotten_flesh|gunpowder|feather|leather|slime_ball|spider_eye/i.test(item.name);
        } else if (category === "all_except_hotbar") {
          shouldDeposit = true;
        }

        if (shouldDeposit) {
          try {
            await container.deposit(item.type, null, item.count);
            depositedCount += item.count;
          } catch {
            // Container full
            break;
          }
        }
      }
    } finally {
      container.close();
    }

    return { depositedCount };
  }
}

export const storage = new StorageManager();

import type { Bot } from "mineflayer";
import Vec3 from "vec3";

export class CraftingManager {
  public async craftItem(bot: Bot, itemName: string, count = 1): Promise<{ crafted: string; count: number }> {
    if (!bot || !bot.entity) throw new Error("Bot is offline.");

    const mcData = (bot as any).registry || (bot as any).mcData;
    const itemInfo = mcData?.itemsByName?.[itemName.toLowerCase()];
    if (!itemInfo) throw new Error(`Unknown Minecraft item: ${itemName}`);

    // Check for existing crafting table nearby
    const craftingTableBlock = bot.findBlock({
      matching: (b) => b.name === "crafting_table",
      maxDistance: 4
    });

    const recipes = bot.recipesFor(itemInfo.id, null, count, craftingTableBlock || null);
    if (!recipes || recipes.length === 0) {
      throw new Error(`No available recipe or missing materials to craft ${itemName}.`);
    }

    const recipe = recipes[0];

    // If recipe requires a crafting table and none is nearby, try to find one within 16 blocks or place one
    if (recipe.requiresTable && !craftingTableBlock) {
      const distantTable = bot.findBlock({
        matching: (b) => b.name === "crafting_table",
        maxDistance: 16
      });

      if (distantTable && bot.pathfinder) {
        const { goals } = await import("mineflayer-pathfinder");
        await bot.pathfinder.goto(new goals.GoalNear(distantTable.position.x, distantTable.position.y, distantTable.position.z, 2));
        const tableClose = bot.blockAt(distantTable.position);
        await bot.craft(recipe, count, tableClose || undefined);
        return { crafted: itemName, count };
      }

      throw new Error(`Crafting ${itemName} requires a crafting table nearby.`);
    }

    await bot.craft(recipe, count, craftingTableBlock || undefined);
    return { crafted: itemName, count };
  }
}

export const crafting = new CraftingManager();

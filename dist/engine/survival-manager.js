const EDIBLE_FOODS = new Set([
    "golden_carrot",
    "cooked_beef",
    "cooked_porkchop",
    "cooked_mutton",
    "cooked_chicken",
    "baked_potato",
    "bread",
    "apple",
    "carrots",
    "sweet_berries",
    "melon_slice"
]);
const ARMOR_PRIORITY = {
    netherite_helmet: 5, diamond_helmet: 4, iron_helmet: 3, chainmail_helmet: 2, golden_helmet: 1, leather_helmet: 1,
    netherite_chestplate: 5, diamond_chestplate: 4, iron_chestplate: 3, chainmail_chestplate: 2, golden_chestplate: 1, leather_chestplate: 1,
    netherite_leggings: 5, diamond_leggings: 4, iron_leggings: 3, chainmail_leggings: 2, golden_leggings: 1, leather_leggings: 1,
    netherite_boots: 5, diamond_boots: 4, iron_boots: 3, chainmail_boots: 2, golden_boots: 1, leather_boots: 1
};
export class SurvivalManager {
    isEating = false;
    lastCheckTime = 0;
    async evaluate(bot) {
        if (!bot || !bot.entity)
            return { actionTaken: null };
        const now = Date.now();
        if (now - this.lastCheckTime < 1500)
            return { actionTaken: null };
        this.lastCheckTime = now;
        // 1. AUTO-EAT CHECK
        const foodLevel = bot.food ?? 20;
        if (foodLevel <= 15 && !this.isEating) {
            const foodItem = bot.inventory.items().find((item) => EDIBLE_FOODS.has(item.name));
            if (foodItem) {
                this.isEating = true;
                try {
                    await bot.equip(foodItem, "hand");
                    await bot.consume();
                    return { actionTaken: `Ate ${foodItem.name} (Food: ${bot.food}/20)` };
                }
                catch {
                    // Eating cancelled or interrupted
                }
                finally {
                    this.isEating = false;
                }
            }
        }
        // 2. AUTO-EQUIP BEST ARMOR
        const armorAction = await this.equipBestArmor(bot);
        if (armorAction)
            return { actionTaken: armorAction };
        // 3. LOW HEALTH MOB HAZARD CHECK
        const health = bot.health ?? 20;
        if (health <= 8) {
            const hostileNear = Object.values(bot.entities).find((e) => {
                if (!e || e === bot.entity || !e.position)
                    return false;
                const dist = bot.entity.position.distanceTo(e.position);
                const isHostile = /zombie|skeleton|creeper|spider|witch|enderman/i.test(e.name || e.type || "");
                return isHostile && dist <= 6;
            });
            if (hostileNear) {
                // Clear pathfinder goal and back up
                if (bot.pathfinder) {
                    const escapeVec = bot.entity.position.minus(hostileNear.position).normalize().scaled(8);
                    const escapeTarget = bot.entity.position.plus(escapeVec);
                    bot.clearControlStates();
                    // Face hostile to block if holding shield
                    const shield = bot.inventory.items().find((i) => i.name === "shield");
                    if (shield && bot.inventory.slots[45]?.name !== "shield") {
                        try {
                            await bot.equip(shield, "off-hand");
                        }
                        catch { }
                    }
                    return { actionTaken: `Low health (${health}/20)! Backing away from ${hostileNear.name}` };
                }
            }
        }
        return { actionTaken: null };
    }
    async equipBestArmor(bot) {
        const slots = [
            { name: "head", type: "helmet", slotIdx: 5 },
            { name: "torso", type: "chestplate", slotIdx: 6 },
            { name: "legs", type: "leggings", slotIdx: 7 },
            { name: "feet", type: "boots", slotIdx: 8 }
        ];
        for (const piece of slots) {
            const current = bot.inventory.slots[piece.slotIdx];
            const currentScore = current ? (ARMOR_PRIORITY[current.name] || 0) : 0;
            const candidates = bot.inventory.items().filter((i) => i.name.endsWith(piece.type));
            let bestItem = current;
            let bestScore = currentScore;
            for (const cand of candidates) {
                const score = ARMOR_PRIORITY[cand.name] || 0;
                if (score > bestScore) {
                    bestScore = score;
                    bestItem = cand;
                }
            }
            if (bestItem && bestItem !== current) {
                try {
                    await bot.equip(bestItem, piece.name);
                    return `Equipped better ${bestItem.name}`;
                }
                catch {
                    // Inventory full or locked
                }
            }
        }
        return null;
    }
}
export const survival = new SurvivalManager();

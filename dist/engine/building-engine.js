import vec3pkg from "vec3";
const Vec3 = vec3pkg.Vec3 || vec3pkg;
import pathfinderPackage from "mineflayer-pathfinder";
const { goals } = pathfinderPackage;
const { GoalNear } = goals;
export class BuildingEngine {
    calculateManifest(blueprint, inventoryItems) {
        const required = {};
        for (const b of blueprint.blocks) {
            required[b.blockName] = (required[b.blockName] || 0) + 1;
        }
        const available = {};
        for (const i of inventoryItems) {
            available[i.name] = (available[i.name] || 0) + i.count;
        }
        const missing = {};
        let canBuild = true;
        for (const [name, reqCount] of Object.entries(required)) {
            const haveCount = available[name] || 0;
            if (haveCount < reqCount) {
                missing[name] = reqCount - haveCount;
                canBuild = false;
            }
        }
        return { required, available, missing, canBuild };
    }
    async constructBlueprint(bot, blueprint, origin, startStep = 0, onProgress) {
        if (!bot || !bot.entity)
            throw new Error("Bot is offline.");
        // Sort blocks in bottom-up placement order (ascending Y)
        const sortedBlocks = [...blueprint.blocks].sort((a, b) => a.relY - b.relY);
        const total = sortedBlocks.length;
        let placedCount = startStep;
        const faces = [
            new Vec3(0, -1, 0), // under
            new Vec3(0, 1, 0), // above
            new Vec3(1, 0, 0),
            new Vec3(-1, 0, 0),
            new Vec3(0, 0, 1),
            new Vec3(0, 0, -1)
        ];
        for (let i = startStep; i < total; i++) {
            const b = sortedBlocks[i];
            const targetPos = new Vec3(origin.x + b.relX, origin.y + b.relY, origin.z + b.relZ);
            // Check current block at target
            const existing = bot.blockAt(targetPos);
            if (existing && existing.name === b.blockName) {
                placedCount++;
                onProgress?.(placedCount, total);
                continue;
            }
            // Walk within reach (4 blocks)
            if (bot.pathfinder && bot.entity.position.distanceTo(targetPos) > 4) {
                try {
                    await bot.pathfinder.goto(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 3));
                }
                catch {
                    // If cannot pathfind directly, continue trying
                }
            }
            // Check for available block in inventory
            const blockItem = bot.inventory.items().find((item) => item.name === b.blockName);
            if (!blockItem) {
                throw new Error(`Ran out of ${b.blockName} while constructing at (${targetPos.x}, ${targetPos.y}, ${targetPos.z}).`);
            }
            // Find adjacent solid block to place against
            let placed = false;
            for (const face of faces) {
                const refPos = targetPos.minus(face);
                const refBlock = bot.blockAt(refPos);
                if (refBlock && refBlock.boundingBox === "block") {
                    try {
                        await bot.equip(blockItem, "hand");
                        await bot.placeBlock(refBlock, face);
                        placed = true;
                        break;
                    }
                    catch {
                        // Placement failed on this face, try next
                    }
                }
            }
            if (placed) {
                placedCount++;
                onProgress?.(placedCount, total);
            }
            await new Promise((r) => setTimeout(r, 200));
        }
        return { placedCount, completed: placedCount === total };
    }
}
export const building = new BuildingEngine();

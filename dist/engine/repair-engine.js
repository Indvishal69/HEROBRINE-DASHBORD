import vec3pkg from "vec3";
const Vec3 = vec3pkg.Vec3 || vec3pkg;
import { building } from "./building-engine.js";
export class RepairEngine {
    scanStructure(bot, blueprint, origin) {
        const missingBlocks = [];
        for (const b of blueprint.blocks) {
            const targetPos = new Vec3(origin.x + b.relX, origin.y + b.relY, origin.z + b.relZ);
            const current = bot.blockAt(targetPos);
            const currentName = current?.name || "air";
            if (currentName !== b.blockName) {
                missingBlocks.push({
                    pos: targetPos,
                    expected: b.blockName,
                    current: currentName
                });
            }
        }
        return {
            missingBlocks,
            totalMissing: missingBlocks.length
        };
    }
    async executeRepair(bot, blueprint, origin, onProgress) {
        const diff = this.scanStructure(bot, blueprint, origin);
        if (diff.totalMissing === 0)
            return { repairedCount: 0 };
        // Filter blueprint to only include missing blocks
        const subBlueprint = {
            ...blueprint,
            blocks: blueprint.blocks.filter((b) => {
                const targetPos = new Vec3(origin.x + b.relX, origin.y + b.relY, origin.z + b.relZ);
                return diff.missingBlocks.some((m) => m.pos.equals(targetPos));
            })
        };
        const res = await building.constructBlueprint(bot, subBlueprint, origin, 0, onProgress);
        return { repairedCount: res.placedCount };
    }
}
export const repair = new RepairEngine();

import type { Bot } from "mineflayer";
import vec3pkg from "vec3";
const Vec3: any = (vec3pkg as any).Vec3 || vec3pkg;
import type { BlueprintRecord } from "../types/tasks.js";
import { building } from "./building-engine.js";

export interface RepairDiff {
  missingBlocks: Array<{ pos: any; expected: string; current: string }>;
  totalMissing: number;
}

export class RepairEngine {
  public scanStructure(
    bot: Bot,
    blueprint: BlueprintRecord,
    origin: { x: number; y: number; z: number }
  ): RepairDiff {
    const missingBlocks: Array<{ pos: any; expected: string; current: string }> = [];

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

  public async executeRepair(
    bot: Bot,
    blueprint: BlueprintRecord,
    origin: { x: number; y: number; z: number },
    onProgress?: (repaired: number, total: number) => void
  ): Promise<{ repairedCount: number }> {
    const diff = this.scanStructure(bot, blueprint, origin);
    if (diff.totalMissing === 0) return { repairedCount: 0 };

    // Filter blueprint to only include missing blocks
    const subBlueprint: BlueprintRecord = {
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

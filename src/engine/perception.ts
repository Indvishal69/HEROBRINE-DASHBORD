import type { Bot } from "mineflayer";
import type { 
  WorldSnapshot, 
  BotCoordinates, 
  EntitySnapshot, 
  DroppedItemSnapshot, 
  InventoryItem, 
  EquipmentSnapshot 
} from "../types/bot.js";

export class PerceptionEngine {
  public captureSnapshot(bot: Bot | null, activeTaskTitle: string | null = null): WorldSnapshot {
    const timestamp = Date.now();

    if (!bot || !bot.entity) {
      return {
        timestamp,
        state: "disconnected",
        username: "MinecraftBuddy",
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        dimension: "overworld",
        vitals: { health: 0, food: 0, isAlive: false, isSleeping: false, dimension: "overworld" },
        activeTask: null,
        activeSlot: 0,
        heldItem: null,
        equipment: { head: null, torso: null, legs: null, feet: null, offhand: null, mainhand: null },
        inventory: [],
        hotbar: [],
        nearbyEntities: [],
        nearbyPlayers: [],
        nearbyDrops: [],
        serverAddress: "offline",
        serverVersion: "1.21.x"
      };
    }

    const pos = bot.entity.position;
    const roundedPos: BotCoordinates = {
      x: Math.round(pos.x * 10) / 10,
      y: Math.round(pos.y * 10) / 10,
      z: Math.round(pos.z * 10) / 10
    };

    // Hotbar (slots 36 to 44)
    const hotbar: InventoryItem[] = [];
    for (let i = 0; i < 9; i++) {
      const slotIndex = 36 + i;
      const item = bot.inventory.slots[slotIndex];
      hotbar.push({
        slot: i,
        name: item?.name || "air",
        count: item?.count || 0,
        displayName: item?.displayName,
        durabilityUsed: item?.durabilityUsed,
        maxDurability: item?.maxDurability
      });
    }

    // Full inventory
    const inventory: InventoryItem[] = bot.inventory.items().map((item) => ({
      slot: item.slot,
      name: item.name,
      count: item.count,
      displayName: item.displayName,
      durabilityUsed: item.durabilityUsed,
      maxDurability: item.maxDurability
    }));

    // Equipment
    const equipment: EquipmentSnapshot = {
      head: bot.inventory.slots[5]?.name || null,
      torso: bot.inventory.slots[6]?.name || null,
      legs: bot.inventory.slots[7]?.name || null,
      feet: bot.inventory.slots[8]?.name || null,
      offhand: bot.inventory.slots[45]?.name || null,
      mainhand: bot.heldItem?.name || null
    };

    // Nearby Entities
    const nearbyEntities: EntitySnapshot[] = Object.values(bot.entities)
      .filter((e) => e && e !== bot.entity && e.position && pos.distanceTo(e.position) <= 24)
      .slice(0, 25)
      .map((e) => {
        const isHostile = /zombie|skeleton|creeper|spider|witch|enderman|pillager|phantom|drowned|husk|slime/i.test(
          e.name || e.type || ""
        );
        return {
          id: e.id,
          name: e.username || e.displayName || e.name || e.type || "unknown",
          type: e.type,
          kind: e.kind,
          position: {
            x: Math.round(e.position.x * 10) / 10,
            y: Math.round(e.position.y * 10) / 10,
            z: Math.round(e.position.z * 10) / 10
          },
          distance: Math.round(pos.distanceTo(e.position) * 10) / 10,
          isHostile
        };
      })
      .sort((a, b) => a.distance - b.distance);

    // Nearby Players
    const nearbyPlayers = Object.entries(bot.players)
      .filter(([name, p]) => name !== bot.username && p.entity)
      .map(([name, p]) => ({
        name,
        position: {
          x: Math.round(p.entity!.position.x * 10) / 10,
          y: Math.round(p.entity!.position.y * 10) / 10,
          z: Math.round(p.entity!.position.z * 10) / 10
        },
        distance: Math.round(pos.distanceTo(p.entity!.position) * 10) / 10
      }))
      .sort((a, b) => a.distance - b.distance);

    // Nearby Dropped Items
    const nearbyDrops: DroppedItemSnapshot[] = Object.values(bot.entities)
      .filter((e) => e && ((e as any).name === "item" || (e as any).type === "item" || (e as any).objectType === "Item") && e.position && pos.distanceTo(e.position) <= 16)
      .slice(0, 15)
      .map((e) => ({
        id: e.id,
        name: (e as any).metadata?.[8]?.name || (e as any).name || "dropped_item",
        count: (e as any).metadata?.[8]?.itemCount || 1,
        position: {
          x: Math.round(e.position.x * 10) / 10,
          y: Math.round(e.position.y * 10) / 10,
          z: Math.round(e.position.z * 10) / 10
        },
        distance: Math.round(pos.distanceTo(e.position) * 10) / 10
      }));

    return {
      timestamp,
      state: "connected",
      username: bot.username || "MinecraftBuddy",
      position: roundedPos,
      yaw: Math.round(bot.entity.yaw * 100) / 100,
      pitch: Math.round(bot.entity.pitch * 100) / 100,
      dimension: (bot.game as any)?.dimension || "overworld",
      vitals: {
        health: bot.health ?? 20,
        food: bot.food ?? 20,
        oxygen: (bot as any).oxygenLevel,
        isAlive: (bot.health ?? 20) > 0,
        isSleeping: Boolean((bot as any).isSleeping),
        dimension: (bot.game as any)?.dimension || "overworld"
      },
      activeTask: activeTaskTitle,
      activeSlot: bot.quickBarSlot ?? 0,
      heldItem: bot.heldItem?.name || null,
      equipment,
      inventory,
      hotbar,
      nearbyEntities,
      nearbyPlayers,
      nearbyDrops,
      serverAddress: (bot as any)._client?.socket?.remoteAddress || "local",
      serverVersion: bot.version || "1.21.x"
    };
  }

  public compressForPrompt(snapshot: WorldSnapshot): string {
    const invSummary = snapshot.inventory
      .slice(0, 12)
      .map((i) => `${i.name}x${i.count}`)
      .join(", ") || "empty";

    const hostiles = snapshot.nearbyEntities
      .filter((e) => e.isHostile)
      .map((e) => `${e.name}(${e.distance}m)`)
      .join(", ") || "none";

    const players = snapshot.nearbyPlayers
      .map((p) => `${p.name}(${p.distance}m)`)
      .join(", ") || "none";

    return [
      `[World State] Pos: (${snapshot.position.x}, ${snapshot.position.y}, ${snapshot.position.z}) in ${snapshot.dimension}`,
      `Health: ${snapshot.vitals.health}/20 | Food: ${snapshot.vitals.food}/20`,
      `Held: ${snapshot.heldItem || "bare hands"} | Active Task: ${snapshot.activeTask || "None"}`,
      `Nearby Hostiles: ${hostiles}`,
      `Nearby Players: ${players}`,
      `Inventory: ${invSummary}`
    ].join("\n");
  }
}

export const perception = new PerceptionEngine();

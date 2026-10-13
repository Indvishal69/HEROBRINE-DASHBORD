import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("7. Advanced MLG Clutch & Fall-Recovery System Suite", async () => {
  const { clutchManager } = await import("../dist/engine/clutch-manager.js");
  const { actionCoordinator, ActionCoordinator } = await import("../dist/engine/action-coordinator.js");
  const { capabilityRegistry } = await import("../dist/engine/capability-registry.js");

  it("should simulate 1.21.x terminal velocity and landing time accurately", () => {
    // Drop from 20 blocks with 0 initial velocity
    const sim20 = clutchManager.simulateLanding(20, 0, 0);
    assert.ok(sim20.ticks > 0, "Ticks must be greater than 0");
    assert.ok(sim20.timeMs > 0, "Time must be greater than 0");
    assert.strictEqual(sim20.timeMs, sim20.ticks * 50, "Time should match ticks * 50ms");
    assert.ok(sim20.finalVy < -1.0, "Final velocity should be negative and accelerated");
    assert.ok(sim20.finalVy >= -3.92, "Terminal velocity must not exceed Java physics limit ~3.92");

    // Drop from 50 blocks
    const sim50 = clutchManager.simulateLanding(50, 0, 0);
    assert.ok(sim50.ticks > sim20.ticks, "50m drop should take more ticks than 20m drop");
  });

  it("should calculate predicted unmitigated fall damage correctly", () => {
    assert.strictEqual(clutchManager.calculatePredictedDamage(2), 0); // 2m = 0 HP
    assert.strictEqual(clutchManager.calculatePredictedDamage(3), 0); // 3m = 0 HP
    assert.strictEqual(clutchManager.calculatePredictedDamage(4), 1); // 4m = 1 HP (0.5 heart)
    assert.strictEqual(clutchManager.calculatePredictedDamage(10), 7); // 10m = 7 HP (3.5 hearts)
    assert.strictEqual(clutchManager.calculatePredictedDamage(20), 17); // 20m = 17 HP (8.5 hearts)
    assert.strictEqual(clutchManager.calculatePredictedDamage(30), 27); // 30m = 27 HP (Lethal)
  });

  it("should detect available clutch items and respect priority order", () => {
    const mockBot = {
      inventory: {
        items: () => [
          { name: "stone", count: 64 },
          { name: "hay_block", count: 4 },
          { name: "slime_block", count: 2 },
          { name: "water_bucket", count: 1 },
          { name: "apple", count: 12 }
        ]
      }
    };

    const available = clutchManager.getAvailableClutchItems(mockBot);
    assert.strictEqual(available.length, 3);
    assert.ok(available.some((i) => i.name === "water_bucket" && i.priority === 1));
    assert.ok(available.some((i) => i.name === "slime_block" && i.priority === 2));
    assert.ok(available.some((i) => i.name === "hay_block" && i.priority === 3));
  });

  it("should select water_bucket as top priority in Overworld on solid ground", () => {
    const mockBot = {
      game: { dimension: "minecraft:overworld" },
      entity: { position: { x: 0, y: 20, z: 0 } },
      inventory: {
        items: () => [
          { name: "water_bucket", count: 1 },
          { name: "hay_block", count: 5 }
        ]
      }
    };

    const surface = { y: 1, name: "stone", isSolid: true, isCushion: false };
    const decision = clutchManager.selectClutchStrategy(mockBot, surface, 19);

    assert.strictEqual(decision.strategy, "water_bucket");
    assert.strictEqual(decision.item, "water_bucket");
  });

  it("should recognize existing water or slime landing surfaces as passive_safe", () => {
    const mockBot = {
      game: { dimension: "minecraft:overworld" },
      entity: { position: { x: 0, y: 15, z: 0 } },
      inventory: { items: () => [] }
    };

    const waterSurface = { y: 1, name: "water", isSolid: false, isCushion: true };
    const waterDecision = clutchManager.selectClutchStrategy(mockBot, waterSurface, 14);
    assert.strictEqual(waterDecision.strategy, "passive_safe");

    const slimeSurface = { y: 1, name: "slime_block", isSolid: true, isCushion: true };
    const slimeDecision = clutchManager.selectClutchStrategy(mockBot, slimeSurface, 14);
    assert.strictEqual(slimeDecision.strategy, "passive_safe");
  });

  it("should strictly ban water_bucket in the Nether and fallback to cushions", () => {
    const mockNetherBot = {
      game: { dimension: "minecraft:the_nether" },
      entity: { position: { x: 10, y: 40, z: 10 } },
      inventory: {
        items: () => [
          { name: "water_bucket", count: 2 }, // Must be ignored in Nether!
          { name: "slime_block", count: 1 },
          { name: "hay_block", count: 4 }
        ]
      }
    };

    const surface = { y: 10, name: "netherrack", isSolid: true, isCushion: false };
    const decision = clutchManager.selectClutchStrategy(mockNetherBot, surface, 30);

    // Should NOT be water_bucket! Water bucket evaporates in Nether!
    assert.notStrictEqual(decision.strategy, "water_bucket");
    assert.strictEqual(decision.strategy, "slime_block");
    assert.strictEqual(decision.item, "slime_block");
  });

  it("should claim exclusive ActionCoordinator Emergency Priority 1 during clutch", () => {
    // 1. Routine task has lock (Priority 6)
    actionCoordinator.requestAction("task_miner", ActionCoordinator.PRIORITY_TASK, "all");
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "task_miner");

    // 2. MLG clutch triggers emergency lock (Priority 1)
    const clutchLocked = actionCoordinator.requestAction("mlg_clutch", ActionCoordinator.PRIORITY_EMERGENCY, "all");
    assert.strictEqual(clutchLocked, true);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "mlg_clutch");

    // 3. Manual WASD control (Priority 2) cannot preempt emergency clutch
    const manualLocked = actionCoordinator.requestAction("manual_override", ActionCoordinator.PRIORITY_MANUAL, "movement");
    assert.strictEqual(manualLocked, false);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "mlg_clutch");

    // 4. Clutch completes and releases
    actionCoordinator.releaseAction("mlg_clutch");
    assert.strictEqual(actionCoordinator.getCurrentOwner(), null);
  });

  it("should execute test arena drill and measure timing accuracy", async () => {
    const mockBot = {
      game: { dimension: "minecraft:overworld" },
      inventory: { items: () => [{ name: "water_bucket", count: 1 }] }
    };

    const drillResult = await clutchManager.runArenaDrill(mockBot, {
      fallHeight: 25,
      surfaceType: "stone",
      dimension: "overworld"
    });

    assert.ok(drillResult.drillId);
    assert.strictEqual(drillResult.result.fallHeight, 25);
    assert.strictEqual(drillResult.result.strategy, "water_bucket");
    assert.strictEqual(drillResult.result.status, "SUCCESS");
    assert.strictEqual(drillResult.result.damageTaken, 0);
    assert.strictEqual(drillResult.result.recoveredWater, true);
    assert.ok(drillResult.timingSummary.includes("Estimated fall time"));
  });

  it("should record failed drill and report evaporation when water is tested in Nether", async () => {
    const mockNetherBot = {
      game: { dimension: "minecraft:the_nether" },
      inventory: { items: () => [{ name: "water_bucket", count: 1 }] }
    };

    const drillResult = await clutchManager.runArenaDrill(mockNetherBot, {
      fallHeight: 20,
      surfaceType: "stone",
      dimension: "nether"
    });

    assert.strictEqual(drillResult.result.dimension, "nether");
    assert.strictEqual(drillResult.result.status, "FAILED");
    assert.strictEqual(drillResult.result.failureReason, "NETHER_WATER_EVAPORATION");
    assert.strictEqual(drillResult.result.damageTaken, 17); // Unmitigated damage
  });

  it("should register mlg_clutch_fall_recovery capability in registry", () => {
    const cap = capabilityRegistry.get("mlg_clutch_fall_recovery");
    assert.ok(cap, "Capability mlg_clutch_fall_recovery must be registered");
    assert.strictEqual(cap.status, "implemented_tested");
    assert.strictEqual(cap.category, "survival");
    assert.ok(cap.limitations && cap.limitations.length >= 2, "Must document known limitations");
  });
});

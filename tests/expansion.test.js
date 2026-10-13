import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("1. Advanced PvP Combat AI Suite", async () => {
  const { combatManager } = await import("../dist/engine/combat-manager.js");

  it("should have PvP strictly disabled by default", () => {
    const config = combatManager.getConfig();
    assert.strictEqual(config.enabled, false);
    assert.strictEqual(config.mode, "disabled");
  });

  it("should block attacks on unapproved players", () => {
    // With PvP disabled
    assert.strictEqual(combatManager.isTargetPermitted("RandomGriefer", true), false);

    // With PvP enabled but target not in allowlist
    combatManager.saveConfig({ enabled: true, mode: "approved_duel", currentDuelOpponent: "FriendlyRival" });
    assert.strictEqual(combatManager.isTargetPermitted("UnauthorizedPlayer", true), false);
    assert.strictEqual(combatManager.isTargetPermitted("FriendlyRival", true), true);

    // Reset back to disabled
    combatManager.saveConfig({ enabled: false, mode: "disabled", currentDuelOpponent: null });
  });

  it("should terminate active engagement on stopCombat", () => {
    combatManager.stopCombat("Test stop");
    assert.strictEqual(combatManager.getState(), "IDLE");
    assert.strictEqual(combatManager.getTarget(), null);
  });
});

describe("2. Smart Food & Hunger System Suite", async () => {
  const { foodManager, FOOD_METADATA } = await import("../dist/engine/food-manager.js");

  it("should contain real 1.21.x metadata for food and saturation", () => {
    assert.ok(FOOD_METADATA.golden_carrot);
    assert.strictEqual(FOOD_METADATA.golden_carrot.foodPoints, 6);
    assert.strictEqual(FOOD_METADATA.golden_carrot.saturation, 14.4);

    assert.ok(FOOD_METADATA.cooked_beef);
    assert.strictEqual(FOOD_METADATA.cooked_beef.foodPoints, 8);
    assert.strictEqual(FOOD_METADATA.cooked_beef.saturation, 12.8);
  });

  it("should filter banned foods and preserve rare consumables", () => {
    const mockBot = {
      inventory: {
        items: () => [
          { name: "rotten_flesh", count: 10 },
          { name: "golden_apple", count: 2 },
          { name: "cooked_beef", count: 8 },
          { name: "bread", count: 16 }
        ]
      }
    };

    const scored = foodManager.getScoredFoodInventory(mockBot, false);
    
    // Cooked beef should be top scored
    assert.strictEqual(scored[0].name, "cooked_beef");
    assert.ok(scored[0].score > 0);

    // Rotten flesh is banned, so score must be negative
    const rotten = scored.find((f) => f.name === "rotten_flesh");
    assert.ok(rotten && rotten.score < 0);

    // Golden apple is preserved in routine mode, so score must be negative
    const gapple = scored.find((f) => f.name === "golden_apple");
    assert.ok(gapple && gapple.score < 0);
  });

  it("should provide an accurate pre-trip food forecast", () => {
    const mockBot = {
      inventory: {
        items: () => [{ name: "bread", count: 4 }] // 4 * 5 = 20 food points
      }
    };

    // 20 min task requires ~36 points
    const forecast = foodManager.forecastFoodSupply(mockBot, 20);
    assert.strictEqual(forecast.sufficient, false);
    assert.ok(forecast.recommendations.length > 0);
  });
});

describe("3. Authoritative Action Coordinator Suite", async () => {
  const { actionCoordinator, ActionCoordinator } = await import("../dist/engine/action-coordinator.js");

  it("should grant action locks and respect priority hierarchy", () => {
    actionCoordinator.forceReleaseAll();

    // 1. Task acquires routine lock (priority 6)
    const taskAcquired = actionCoordinator.requestAction("task_miner", ActionCoordinator.PRIORITY_TASK);
    assert.strictEqual(taskAcquired, true);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "task_miner");

    // 2. Another routine task tries to acquire same lock -> blocked
    const conflictAcquired = actionCoordinator.requestAction("task_builder", ActionCoordinator.PRIORITY_TASK);
    assert.strictEqual(conflictAcquired, false);

    // 3. Emergency survival (priority 1) preempts routine task
    const emergencyAcquired = actionCoordinator.requestAction("emergency_survival", ActionCoordinator.PRIORITY_EMERGENCY);
    assert.strictEqual(emergencyAcquired, true);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "emergency_survival");

    // 4. Clean release
    actionCoordinator.releaseAction("emergency_survival");
    assert.strictEqual(actionCoordinator.getCurrentOwner(), null);
  });
});

describe("4. Autonomy Levels & Safety Suite", async () => {
  const { autonomyManager } = await import("../dist/engine/autonomy-manager.js");

  it("should block world alteration in Autonomy Level 0 (OBSERVE)", () => {
    autonomyManager.setLevel(0);
    const mineCheck = autonomyManager.canExecute("mine", "autonomous");
    assert.strictEqual(mineCheck.permitted, false);

    const observeCheck = autonomyManager.canExecute("observe", "autonomous");
    assert.strictEqual(observeCheck.permitted, true);
  });

  it("should permit routine survival in Level 2 and projects in Level 3", () => {
    autonomyManager.setLevel(2);
    assert.strictEqual(autonomyManager.canExecute("eat", "autonomous").permitted, true);
    assert.strictEqual(autonomyManager.canExecute("mine", "autonomous").permitted, false);

    autonomyManager.setLevel(3);
    assert.strictEqual(autonomyManager.canExecute("mine", "autonomous").permitted, true);
    assert.strictEqual(autonomyManager.canExecute("combat_pvp", "autonomous").permitted, false);

    // Restore to default Level 4
    autonomyManager.setLevel(4);
  });
});

describe("5. Build Transactions & Conflict-Safe Rollback Suite", async () => {
  const { buildTransactionManager } = await import("../dist/engine/build-transactions.js");

  it("should record build transactions and rollback without conflicts", async () => {
    const tx = buildTransactionManager.startTransaction("test_user", { x: 100, y: 64, z: 100 }, "bp-1", "test_box");
    buildTransactionManager.recordChange(tx.id, 100, 64, 100, "overworld", "air", "oak_planks");
    buildTransactionManager.commitTransaction(tx.id);

    const mockBot = {
      blockAt: () => ({ name: "oak_planks" })
    };

    const res = await buildTransactionManager.rollbackTransaction(mockBot, tx.id);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.restoredCount, 1);
    assert.strictEqual(res.conflicts.length, 0);
  });

  it("should detect external player conflicts and halt rollback safely", async () => {
    const tx = buildTransactionManager.startTransaction("test_user", { x: 200, y: 64, z: 200 }, "bp-2", "wall");
    buildTransactionManager.recordChange(tx.id, 200, 64, 200, "overworld", "air", "stone_bricks");
    buildTransactionManager.commitTransaction(tx.id);

    // A player broke stone_bricks and placed glass!
    const mockBot = {
      blockAt: () => ({ name: "glass" })
    };

    const res = await buildTransactionManager.rollbackTransaction(mockBot, tx.id);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.conflicts.length, 1);
    assert.strictEqual(res.conflicts[0].expected, "stone_bricks");
    assert.strictEqual(res.conflicts[0].actual, "glass");
  });
});

describe("6. World Intelligence & Multi-Agent Suites", async () => {
  const { worldIntelligence } = await import("../dist/engine/world-intelligence.js");
  const { multiAgentManager, MultiAgentManager } = await import("../dist/engine/multi-agent.js");
  const { capabilityRegistry } = await import("../dist/engine/capability-registry.js");

  it("should record landmarks and calculate nearest distance accurately", () => {
    const lm = worldIntelligence.recordLandmark(
      "Main Fortress",
      "home",
      { x: 0, y: 64, z: 0 },
      "overworld"
    );

    const nearest = worldIntelligence.findNearest({ x: 3, y: 64, z: 4 }, "home", "overworld");
    assert.ok(nearest);
    assert.strictEqual(nearest.landmark.name, "Main Fortress");
    assert.strictEqual(nearest.distance, 5); // sqrt(3^2 + 4^2) = 5
  });

  it("should manage task leases and prevent duplicate bot execution", () => {
    const taskId = "task-alpha-123";
    const lease1 = multiAgentManager.acquireTaskLease(taskId, 5000);
    assert.strictEqual(lease1.acquired, true);

    // Another bot instance tries to lease it
    process.env.BOT_INSTANCE_ID = "nexus-bot-secondary";
    const secondaryManager = new MultiAgentManager();
    const lease2 = secondaryManager.acquireTaskLease(taskId, 5000);
    assert.strictEqual(lease2.acquired, false);

    // Cleanup
    process.env.BOT_INSTANCE_ID = "nexus-bot-primary";
    multiAgentManager.releaseTaskLease(taskId);
  });

  it("should expose capability registry with verified statuses", () => {
    const caps = capabilityRegistry.getAll();
    assert.ok(caps.length >= 10);
    const pvpCap = capabilityRegistry.get("pvp_combat_ai");
    assert.ok(pvpCap);
    assert.strictEqual(pvpCap.status, "implemented_tested");
  });
});

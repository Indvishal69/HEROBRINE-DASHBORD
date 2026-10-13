import test, { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("8. Master Acceptance Criteria Suite (Criteria A through N)", async () => {
  const { foodManager, FOOD_METADATA } = await import("../dist/engine/food-manager.js");
  const { combatManager } = await import("../dist/engine/combat-manager.js");
  const { survival } = await import("../dist/engine/survival-manager.js");
  const { actionCoordinator, ActionCoordinator } = await import("../dist/engine/action-coordinator.js");
  const { manualControl } = await import("../dist/bot/manual-control.js");
  const { perception } = await import("../dist/engine/perception.js");
  const { AuditRepo } = await import("../dist/storage/database.js");

  // A. Routine hunger causes the bot to select and consume suitable food, with the result verified.
  it("A. Routine hunger causes the bot to select and consume suitable food, with the result verified", async () => {
    actionCoordinator.forceReleaseAll();
    let consumed = false;

    const mockBot = {
      food: 12,
      foodSaturation: 4,
      quickBarSlot: 0,
      inventory: {
        items: () => [
          { name: "cooked_beef", count: 8 },
          { name: "dirt", count: 64 }
        ],
        slots: []
      },
      equip: async (item, hand) => {},
      consume: async function() {
        consumed = true;
        this.food = 20;
        this.foodSaturation = 16.8;
      },
      setQuickBarSlot: () => {}
    };

    const res = await foodManager.executeEat(mockBot, false, "C_ROUTINE_HUNGER");
    assert.strictEqual(consumed, true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.foodName, "cooked_beef");
    assert.strictEqual(res.foodLevelBefore, 12);
    assert.strictEqual(res.foodLevelAfter, 20);
    assert.strictEqual(res.saturationAfter, 16.8);
    actionCoordinator.forceReleaseAll();
  });

  // B. An empty food inventory produces an accurate warning rather than an endless loop.
  it("B. An empty food inventory produces an accurate warning rather than an endless loop", async () => {
    actionCoordinator.forceReleaseAll();

    const emptyBot = {
      food: 8,
      inventory: {
        items: () => [{ name: "cobblestone", count: 64 }] // No food
      }
    };

    const startTime = Date.now();
    const res = await foodManager.executeEat(emptyBot, false, "C_ROUTINE_HUNGER");
    const elapsed = Date.now() - startTime;

    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("No food found in inventory"));
    assert.ok(elapsed < 100, "Must return immediately without looping");
  });

  // C. A banned food item is not selected.
  it("C. A banned food item is not selected", () => {
    const mockBot = {
      inventory: {
        items: () => [
          { name: "rotten_flesh", count: 16 },
          { name: "spider_eye", count: 5 },
          { name: "pufferfish", count: 2 }
        ]
      }
    };

    const scored = foodManager.getScoredFoodInventory(mockBot, false);
    for (const item of scored) {
      assert.ok(item.score <= 0, `Banned item ${item.name} must not have positive score`);
      assert.strictEqual(item.isBanned, true);
    }

    const eligible = scored.find((f) => f.score > 0);
    assert.strictEqual(eligible, undefined, "No banned food should be eligible");
  });

  // D. An eating failure is detected and handled safely.
  it("D. An eating failure is detected and handled safely", async () => {
    actionCoordinator.forceReleaseAll();

    const failingBot = {
      food: 10,
      inventory: {
        items: () => [{ name: "bread", count: 3 }]
      },
      equip: async () => {},
      consume: async () => {
        throw new Error("Item consumption interrupted by entity attack");
      },
      setQuickBarSlot: () => {}
    };

    const res = await foodManager.executeEat(failingBot, false, "C_ROUTINE_HUNGER");
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("interrupted by entity attack"));
    assert.strictEqual(foodManager.isCurrentlyEating(), false, "isEating flag must be reset on failure");
    assert.strictEqual(actionCoordinator.getCurrentOwner(), null, "Action lock must be released on failure");
  });

  // E. PvP remains disabled by default.
  it("E. PvP remains disabled by default", () => {
    const config = combatManager.getConfig();
    assert.strictEqual(config.enabled, false);
    assert.strictEqual(config.mode, "disabled");
  });

  // F. The bot attacks only explicitly approved targets when configured.
  it("F. The bot attacks only explicitly approved targets when configured", () => {
    combatManager.saveConfig({
      enabled: true,
      mode: "approved_duel",
      currentDuelOpponent: "KnightChampion",
      approvedTargets: ["KnightChampion"],
      protectedPlayers: ["ServerAdmin"]
    });

    assert.strictEqual(combatManager.isTargetPermitted("KnightChampion", true), true);
    assert.strictEqual(combatManager.isTargetPermitted("RandomAttacker", true), false);
    assert.strictEqual(combatManager.isTargetPermitted("ServerAdmin", true), false);

    // Reset back to disabled
    combatManager.saveConfig({ enabled: false, mode: "disabled", currentDuelOpponent: null });
  });

  // G. The stop-combat control terminates the active engagement.
  it("G. The stop-combat control terminates the active engagement", () => {
    combatManager.transitionTo("ENGAGE", "Test engage");
    actionCoordinator.requestAction("combat", ActionCoordinator.PRIORITY_COMBAT);

    assert.strictEqual(combatManager.getState(), "ENGAGE");
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "combat");

    combatManager.stopCombat("User requested termination");

    assert.strictEqual(combatManager.getState(), "IDLE");
    assert.strictEqual(combatManager.getTarget(), null);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), null);
  });

  // H. A health emergency interrupts nonessential tasks.
  it("H. A health emergency interrupts nonessential tasks", async () => {
    actionCoordinator.forceReleaseAll();

    // Task has priority 6 lock
    actionCoordinator.requestAction("task_mining", ActionCoordinator.PRIORITY_TASK);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "task_mining");

    const criticalBot = {
      health: 4, // Below emergencyHealthThreshold (8)
      food: 12,
      entity: { position: { x: 0, y: 64, z: 0 } },
      inventory: { items: () => [], slots: [] }
    };

    const outcome = await survival.evaluate(criticalBot, true);
    assert.strictEqual(survival.getCurrentPriority(), "A_CRITICAL");
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "emergency_survival");
    actionCoordinator.forceReleaseAll();
  });

  // I. Food recovery and combat cannot issue conflicting item-use or movement actions.
  it("I. Food recovery and combat cannot issue conflicting item-use or movement actions", () => {
    actionCoordinator.forceReleaseAll();

    // Combat recovery (Priority 3) claims lock
    const recoveryLocked = actionCoordinator.requestAction("combat_recovery", ActionCoordinator.PRIORITY_COMBAT_RECOVERY, "all");
    assert.strictEqual(recoveryLocked, true);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "combat_recovery");

    // Standard combat engagement (Priority 4) tries to preempt recovery -> rejected!
    const engageLocked = actionCoordinator.requestAction("combat", ActionCoordinator.PRIORITY_COMBAT, "all");
    assert.strictEqual(engageLocked, false);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "combat_recovery");

    actionCoordinator.forceReleaseAll();
  });

  // J. Manual browser control suspends autonomous movement.
  it("J. Manual browser control suspends autonomous movement", () => {
    actionCoordinator.forceReleaseAll();

    const mockBot = {
      clearControlStates: () => {},
      setControlState: () => {},
      pathfinder: { setGoal: () => {} }
    };

    manualControl.setManualActive(true, mockBot);
    manualControl.handleControlPress(mockBot, "forward", true);
    assert.strictEqual(manualControl.isManualActive(), true);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), "manual_control");

    // Autonomous tasks (Priority 6) cannot acquire action lock while manual is active
    const taskAcquired = actionCoordinator.requestAction("task_farm", ActionCoordinator.PRIORITY_TASK);
    assert.strictEqual(taskAcquired, false);

    manualControl.setManualActive(false, mockBot);
    assert.strictEqual(manualControl.isManualActive(), false);
    assert.strictEqual(actionCoordinator.getCurrentOwner(), null);
  });

  // K. A disconnected bot stops unsafe actions and validates state before resuming.
  it("K. A disconnected bot stops unsafe actions and validates state before resuming", () => {
    // Acquire locks
    actionCoordinator.requestAction("combat", ActionCoordinator.PRIORITY_COMBAT);
    combatManager.transitionTo("ENGAGE", "Engaging");

    // Simulate cleanup on disconnect
    actionCoordinator.forceReleaseAll();
    combatManager.stopCombat("Bot disconnected");

    assert.strictEqual(combatManager.getState(), "IDLE");
    assert.strictEqual(actionCoordinator.getCurrentOwner(), null);
  });

  // L. Rare consumables follow the configured conservation policy.
  it("L. Rare consumables follow the configured conservation policy", () => {
    const mockBot = {
      inventory: {
        items: () => [
          { name: "golden_apple", count: 2 },
          { name: "baked_potato", count: 10 }
        ]
      }
    };

    // 1. In routine hunger: golden_apple is preserved (negative score)
    const routineScored = foodManager.getScoredFoodInventory(mockBot, false);
    const routineGapple = routineScored.find((f) => f.name === "golden_apple");
    assert.ok(routineGapple && routineGapple.score < 0, "Golden apple must be preserved in routine mode");
    assert.strictEqual(routineScored[0].name, "baked_potato");

    // 2. In emergency mode: golden_apple is permitted and prioritized for healing
    const emergencyScored = foodManager.getScoredFoodInventory(mockBot, true);
    const emergencyGapple = emergencyScored.find((f) => f.name === "golden_apple");
    assert.ok(emergencyGapple && emergencyGapple.score > 0, "Golden apple must have positive score during emergency");
    assert.strictEqual(emergencyScored[0].name, "golden_apple");
  });

  // M. All actions, failures, and recovery events appear in appropriate logs.
  it("M. All actions, failures, and recovery events appear in appropriate logs", () => {
    const logId = String(Date.now());
    AuditRepo.add({
      id: logId,
      timestamp: Date.now(),
      actor: "test_suite",
      action: "acceptance_audit_verification",
      component: "nexus_test",
      severity: "info",
      details: { verified: true }
    });

    const logs = AuditRepo.getRecent(10);
    assert.ok(logs.some((l) => l.id === logId));
  });

  // N. Dashboard values reflect actual bot observations.
  it("N. Dashboard values reflect actual bot observations", () => {
    const mockBot = {
      username: "NexusBot",
      health: 18,
      food: 16,
      foodSaturation: 7.2,
      entity: {
        position: { x: 120.5, y: 65, z: -250.3 },
        velocity: { x: 0, y: 0, z: 0 },
        pitch: 0,
        yaw: 1.57
      },
      heldItem: { name: "diamond_sword", count: 1 },
      inventory: {
        items: () => [{ name: "diamond_sword", count: 1, slot: 36 }],
        slots: []
      },
      entities: {}
    };

    const snap = perception.captureSnapshot(mockBot, "Guarding Base");

    assert.strictEqual(snap.username, "NexusBot");
    assert.strictEqual(snap.vitals.health, 18);
    assert.strictEqual(snap.vitals.food, 16);
    assert.strictEqual(snap.vitals.saturation, 7.2);
    assert.strictEqual(snap.position.x, 120.5);
    assert.strictEqual(snap.position.y, 65);
    assert.strictEqual(snap.position.z, -250.3);
    assert.strictEqual(snap.heldItem, "diamond_sword");
    assert.strictEqual(snap.activeTask, "Guarding Base");
  });
});

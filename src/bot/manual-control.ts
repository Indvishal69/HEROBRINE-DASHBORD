import type { Bot } from "mineflayer";
import { actionCoordinator, ActionCoordinator } from "../engine/action-coordinator.js";

export class ManualControlManager {
  private active = false;
  private heldControls = new Set<string>();

  public isManualActive(): boolean {
    return this.active;
  }

  public setManualActive(active: boolean, bot: Bot | null): void {
    this.active = active;
    if (active) {
      actionCoordinator.requestAction("manual_control", ActionCoordinator.PRIORITY_MANUAL, "all");
      if (bot?.pathfinder) {
        bot.pathfinder.setGoal(null);
      }
    } else {
      actionCoordinator.releaseAction("manual_control");
      if (bot) {
        this.releaseAll(bot);
      }
    }
  }

  public handleControlPress(bot: Bot, control: string, pressed: boolean): void {
    if (!bot) return;
    if (!this.active) {
      this.setManualActive(true, bot);
    }

    if (pressed) {
      this.heldControls.add(control);
      if (bot.pathfinder) bot.pathfinder.setGoal(null);
    } else {
      this.heldControls.delete(control);
    }

    try {
      bot.setControlState(control as any, pressed);
    } catch {}
  }

  public handleLook(bot: Bot, yaw: number, pitch: number): void {
    if (!bot) return;
    if (!this.active) {
      this.setManualActive(true, bot);
    }
    try {
      bot.look(yaw, pitch, true).catch(() => {});
    } catch {}
  }

  public handleTurn(bot: Bot, deltaYaw: number, deltaPitch = 0): void {
    if (!bot) return;
    if (!this.active) {
      this.setManualActive(true, bot);
    }
    try {
      const curYaw = bot.entity?.yaw || 0;
      const curPitch = bot.entity?.pitch || 0;
      bot.look(curYaw + deltaYaw, curPitch + deltaPitch, true).catch(() => {});
    } catch {}
  }

  public handleAttack(bot: Bot): void {
    if (!bot) return;
    if (!this.active) {
      this.setManualActive(true, bot);
    }
    try {
      const target = bot.nearestEntity((e) => 
        (e.type === "mob" || e.type === "player") && 
        bot.entity.position.distanceTo(e.position) <= 3.8
      );
      if (target) {
        bot.attack(target);
      } else {
        bot.swingArm("right");
      }
    } catch {}
  }

  public handleUse(bot: Bot): void {
    if (!bot) return;
    if (!this.active) {
      this.setManualActive(true, bot);
    }
    try {
      bot.activateItem();
    } catch {}
  }

  public releaseAll(bot: Bot): void {
    this.heldControls.clear();
    try {
      bot.clearControlStates();
    } catch {}
  }
}

export const manualControl = new ManualControlManager();

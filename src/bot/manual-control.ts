import type { Bot } from "mineflayer";

export class ManualControlManager {
  private active = false;
  private heldControls = new Set<string>();

  public isManualActive(): boolean {
    return this.active;
  }

  public setManualActive(active: boolean, bot: Bot | null): void {
    this.active = active;
    if (!active && bot) {
      this.releaseAll(bot);
    }
  }

  public handleControlPress(bot: Bot, control: string, pressed: boolean): void {
    if (!bot || !this.active) return;

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
    if (!bot || !this.active) return;
    try {
      bot.look(yaw, pitch, true).catch(() => {});
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

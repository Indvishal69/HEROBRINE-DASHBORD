import { actionCoordinator, ActionCoordinator } from "../engine/action-coordinator.js";
export class ManualControlManager {
    active = false;
    heldControls = new Set();
    isManualActive() {
        return this.active;
    }
    setManualActive(active, bot) {
        this.active = active;
        if (active) {
            actionCoordinator.requestAction("manual_control", ActionCoordinator.PRIORITY_MANUAL, "all");
            if (bot?.pathfinder) {
                bot.pathfinder.setGoal(null);
            }
        }
        else {
            actionCoordinator.releaseAction("manual_control");
            if (bot) {
                this.releaseAll(bot);
            }
        }
    }
    handleControlPress(bot, control, pressed) {
        if (!bot || !this.active)
            return;
        if (pressed) {
            this.heldControls.add(control);
            if (bot.pathfinder)
                bot.pathfinder.setGoal(null);
        }
        else {
            this.heldControls.delete(control);
        }
        try {
            bot.setControlState(control, pressed);
        }
        catch { }
    }
    handleLook(bot, yaw, pitch) {
        if (!bot || !this.active)
            return;
        try {
            bot.look(yaw, pitch, true).catch(() => { });
        }
        catch { }
    }
    releaseAll(bot) {
        this.heldControls.clear();
        try {
            bot.clearControlStates();
        }
        catch { }
    }
}
export const manualControl = new ManualControlManager();

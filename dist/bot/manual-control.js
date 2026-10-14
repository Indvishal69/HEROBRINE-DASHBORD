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
        if (!bot)
            return;
        if (!this.active) {
            this.setManualActive(true, bot);
        }
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
        if (!bot)
            return;
        if (!this.active) {
            this.setManualActive(true, bot);
        }
        try {
            bot.look(yaw, pitch, true).catch(() => { });
        }
        catch { }
    }
    handleTurn(bot, deltaYaw, deltaPitch = 0) {
        if (!bot)
            return;
        if (!this.active) {
            this.setManualActive(true, bot);
        }
        try {
            const curYaw = bot.entity?.yaw || 0;
            const curPitch = bot.entity?.pitch || 0;
            bot.look(curYaw + deltaYaw, curPitch + deltaPitch, true).catch(() => { });
        }
        catch { }
    }
    handleAttack(bot) {
        if (!bot)
            return;
        if (!this.active) {
            this.setManualActive(true, bot);
        }
        try {
            const target = bot.nearestEntity((e) => (e.type === "mob" || e.type === "player") &&
                bot.entity.position.distanceTo(e.position) <= 3.8);
            if (target) {
                bot.attack(target);
            }
            else {
                bot.swingArm("right");
            }
        }
        catch { }
    }
    handleUse(bot) {
        if (!bot)
            return;
        if (!this.active) {
            this.setManualActive(true, bot);
        }
        try {
            bot.activateItem();
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

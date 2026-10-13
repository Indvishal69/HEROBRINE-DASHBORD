export class ManualControlManager {
    active = false;
    heldControls = new Set();
    isManualActive() {
        return this.active;
    }
    setManualActive(active, bot) {
        this.active = active;
        if (!active && bot) {
            this.releaseAll(bot);
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

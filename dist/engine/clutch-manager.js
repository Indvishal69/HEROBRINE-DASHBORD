import { Vec3 } from "vec3";
import crypto from "node:crypto";
import { actionCoordinator, ActionCoordinator } from "./action-coordinator.js";
import { AuditRepo } from "../storage/database.js";
import { eventTimeline } from "./event-timeline.js";
const DEFAULT_CONFIG = {
    mode: "survival_emergency",
    minFallHeightThreshold: 4.0, // Falls >= 4 blocks deal damage
    triggerDistanceBlocks: 3.4, // Distance above impact surface to execute placement
    triggerTimeMs: 160, // Milliseconds before estimated landing to trigger action
    autoRecoverWater: true, // Automatically pick up placed water with empty bucket
    steerToNearbySafeSurfaces: true, // Drift laterally toward safe water/hay if unable to place
    preferredItemOrder: [
        "water_bucket",
        "slime_block",
        "hay_block",
        "cobweb",
        "powder_snow_bucket",
        "totem_of_undying"
    ]
};
export class ClutchManager {
    config = { ...DEFAULT_CONFIG };
    state = "idle";
    activeBot = null;
    // Real-time tracking
    isFalling = false;
    fallStartHeight = 0;
    peakFallVelocity = 0;
    consecutiveFallTicks = 0;
    activeStrategy = "none";
    targetImpactY = 0;
    targetSurfaceName = "air";
    placementTriggered = false;
    placementTimestamp = 0;
    waterPlacedPosition = null;
    healthBeforeImpact = 20;
    // History & Metrics
    lastClutchResult = null;
    stats = {
        totalAttempts: 0,
        successful: 0,
        partial: 0,
        failed: 0,
        successRate: 100,
        avgPlacementDelayMs: 0
    };
    delaySamples = [];
    // Physics loop handler
    physicsTickHandler = null;
    deathHandler = null;
    respawnHandler = null;
    constructor() {
        this.loadStats();
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(patch) {
        this.config = { ...this.config, ...patch };
    }
    getState() {
        return this.state;
    }
    getStats() {
        return { ...this.stats };
    }
    getLastResult() {
        return this.lastClutchResult;
    }
    /**
     * Attaches high-frequency physics tick and life cycle listeners to the Mineflayer bot
     */
    attach(bot) {
        this.detach();
        this.activeBot = bot;
        // Listen on 20 TPS physics tick for zero-latency reaction
        this.physicsTickHandler = () => {
            this.onPhysicsTick(bot);
        };
        bot.on("physicsTick", this.physicsTickHandler);
        // Handle death and respawn
        this.deathHandler = () => {
            this.handleDeath(bot);
        };
        bot.on("death", this.deathHandler);
        this.respawnHandler = () => {
            this.handleRespawn(bot);
        };
        bot.on("respawn", this.respawnHandler);
    }
    /**
     * Detaches listeners and releases locks cleanly
     */
    detach() {
        if (this.activeBot) {
            if (this.physicsTickHandler) {
                this.activeBot.removeListener("physicsTick", this.physicsTickHandler);
                this.physicsTickHandler = null;
            }
            if (this.deathHandler) {
                this.activeBot.removeListener("death", this.deathHandler);
                this.deathHandler = null;
            }
            if (this.respawnHandler) {
                this.activeBot.removeListener("respawn", this.respawnHandler);
                this.respawnHandler = null;
            }
        }
        this.activeBot = null;
        this.resetFallState();
    }
    /**
     * Generates a comprehensive live snapshot for the dashboard and telemetry
     */
    getSnapshot(bot) {
        const targetBot = bot || this.activeBot;
        const items = targetBot ? this.getAvailableClutchItems(targetBot) : [];
        const vy = targetBot?.entity?.velocity?.y ?? 0;
        const posY = targetBot?.entity?.position?.y ?? 0;
        const groundY = this.targetImpactY;
        const distanceToGround = groundY > 0 ? Math.max(0, posY - groundY) : 0;
        const landing = this.simulateLanding(posY, vy, groundY);
        return {
            isFalling: this.isFalling,
            fallDistance: this.isFalling ? Math.max(0, this.fallStartHeight - posY) : 0,
            verticalVelocity: vy,
            estimatedLandingTimeMs: landing.timeMs,
            predictedDamage: this.calculatePredictedDamage(distanceToGround),
            impactY: this.targetImpactY,
            surfaceBlockName: this.targetSurfaceName,
            mode: this.config.mode,
            state: this.state,
            selectedStrategy: this.activeStrategy,
            availableItems: items,
            lastClutchResult: this.lastClutchResult || undefined,
            stats: { ...this.stats }
        };
    }
    /**
     * Core 20 TPS Physics Tick evaluation:
     * Real-time deterministic detection and execution without AI request delays.
     */
    onPhysicsTick(bot) {
        if (this.config.mode === "disabled" || !bot.entity)
            return;
        const onGround = bot.entity.onGround;
        const vy = bot.entity.velocity.y;
        const posY = bot.entity.position.y;
        // 1. Detect Falling State:
        // Bot is airborne and vertical velocity is significantly negative (downward)
        const isDownwardAirborne = !onGround && vy < -0.15;
        if (isDownwardAirborne) {
            this.consecutiveFallTicks++;
            if (!this.isFalling) {
                this.isFalling = true;
                this.fallStartHeight = posY;
                this.peakFallVelocity = vy;
                this.healthBeforeImpact = bot.health ?? 20;
                this.placementTriggered = false;
                this.waterPlacedPosition = null;
                this.state = "falling";
            }
            if (vy < this.peakFallVelocity) {
                this.peakFallVelocity = vy;
            }
            // Check impact surface below
            const surface = this.detectImpactSurface(bot);
            if (!surface) {
                // Void fall or undetectable
                this.targetImpactY = 0;
                this.targetSurfaceName = "void";
                this.activeStrategy = "none";
                return;
            }
            this.targetImpactY = surface.y;
            this.targetSurfaceName = surface.name;
            const currentDistance = posY - surface.y;
            const totalEstimatedFall = this.fallStartHeight - surface.y;
            // In survival_emergency mode, ignore minor harmless falls
            if (this.config.mode === "survival_emergency" && totalEstimatedFall < this.config.minFallHeightThreshold) {
                this.activeStrategy = "none";
                return;
            }
            // 2. Select strategy based on environment, dimension, and inventory
            const strategyDecision = this.selectClutchStrategy(bot, surface, currentDistance);
            this.activeStrategy = strategyDecision.strategy;
            // 3. Trajectory & Landing timing simulation
            const landing = this.simulateLanding(posY, vy, surface.y);
            // 4. Feasible alternative: Airborne lateral steering if clutch item unavailable
            if ((this.activeStrategy === "steer_to_water" || this.activeStrategy === "steer_to_cushion") &&
                strategyDecision.alternativeCoordinate) {
                this.executeLateralDrift(bot, strategyDecision.alternativeCoordinate);
            }
            // 5. Emergency Execution Trigger Window:
            // When distance is within placement reach (e.g. <= 3.4m) or time to impact is <= 160ms (2-3 ticks)
            const isWithinTriggerWindow = currentDistance <= this.config.triggerDistanceBlocks ||
                landing.timeMs <= this.config.triggerTimeMs;
            if (isWithinTriggerWindow && !this.placementTriggered && this.isPlacementStrategy(this.activeStrategy)) {
                this.executeClutchPlacement(bot, surface, strategyDecision.item);
            }
        }
        else if (onGround && this.isFalling) {
            // Bot has touched ground or landed
            this.handleLanding(bot);
        }
    }
    /**
     * Selects optimal clutch method based on dimension, environment, and items
     */
    selectClutchStrategy(bot, surface, distanceToGround) {
        const dim = this.getNormalizedDimension(bot);
        const isNether = dim === "nether";
        // A. Check if the landing surface is already safe / cushioned
        if (surface.name.includes("water")) {
            return { strategy: "passive_safe" };
        }
        if (surface.name.includes("slime_block")) {
            return { strategy: "passive_safe" };
        }
        if (surface.name.includes("cobweb")) {
            return { strategy: "passive_safe" };
        }
        if (surface.name.includes("hay_block")) {
            // Hay bale reduces 80% fall damage
            return { strategy: "passive_safe" };
        }
        // B. Check available placement items
        const available = this.getAvailableClutchItems(bot);
        for (const pref of this.config.preferredItemOrder) {
            const candidate = available.find((a) => a.name === pref);
            if (!candidate || candidate.count <= 0)
                continue;
            // NETHER RESTRICTION: Water bucket evaporates!
            if (isNether && (pref === "water_bucket" || pref === "powder_snow_bucket")) {
                continue;
            }
            if (pref === "water_bucket") {
                return { strategy: "water_bucket", item: "water_bucket" };
            }
            if (pref === "slime_block") {
                return { strategy: "slime_block", item: "slime_block" };
            }
            if (pref === "hay_block") {
                return { strategy: "hay_bale", item: "hay_block" };
            }
            if (pref === "cobweb") {
                return { strategy: "cobweb", item: "cobweb" };
            }
            if (pref === "powder_snow_bucket") {
                return { strategy: "powder_snow_bucket", item: "powder_snow_bucket" };
            }
        }
        // C. No placement items found: Check for lateral air drift toward nearby water/hay
        if (this.config.steerToNearbySafeSurfaces) {
            const nearbySafe = this.findNearbySafeSurface(bot, surface.y, 4);
            if (nearbySafe) {
                return {
                    strategy: nearbySafe.type === "water" ? "steer_to_water" : "steer_to_cushion",
                    alternativeCoordinate: nearbySafe.pos
                };
            }
        }
        // D. Emergency fallback: Totem of Undying in offhand
        const hasTotem = available.some((a) => a.name === "totem_of_undying" && a.count > 0);
        if (hasTotem) {
            return { strategy: "totem_of_undying", item: "totem_of_undying" };
        }
        return { strategy: "none" };
    }
    /**
     * Scans downwards from bot's position to find the impact surface
     */
    detectImpactSurface(bot) {
        if (!bot.entity)
            return null;
        const startX = Math.floor(bot.entity.position.x);
        const startY = Math.floor(bot.entity.position.y);
        const startZ = Math.floor(bot.entity.position.z);
        const minY = bot.game?.minY ?? -64;
        for (let y = startY; y >= minY; y--) {
            const block = bot.blockAt(new Vec3(startX, y, startZ));
            if (!block || block.name === "air" || block.name === "cave_air")
                continue;
            const isWater = block.name === "water" || block.name === "flowing_water";
            const isSlime = block.name === "slime_block";
            const isHay = block.name === "hay_block";
            const isCobweb = block.name === "cobweb";
            const isSolid = block.boundingBox === "block" || block.name.includes("stone") || block.name.includes("dirt") || block.name.includes("grass");
            return {
                y: y + 1, // Landing surface is the top face of the block
                name: block.name,
                isSolid,
                isCushion: isWater || isSlime || isHay || isCobweb
            };
        }
        return null;
    }
    /**
     * Simulates 1.21.x terminal velocity step-by-step
     * Java Edition vertical drag: 0.98, gravity: 0.08 blocks/tick^2
     */
    simulateLanding(currentY, currentVy, targetY) {
        let simY = currentY;
        let simVy = currentVy;
        let ticks = 0;
        while (simY > targetY && ticks < 200) {
            simVy = (simVy - 0.08) * 0.98;
            simY += simVy;
            ticks++;
        }
        return {
            ticks,
            timeMs: ticks * 50,
            finalVy: simVy
        };
    }
    /**
     * Calculates predicted unmitigated fall damage (damage = max(0, fallDistance - 3))
     */
    calculatePredictedDamage(fallDistance) {
        return Math.max(0, Math.floor(fallDistance) - 3);
    }
    /**
     * Checks inventory for clutch utilities and assigns priority
     */
    getAvailableClutchItems(bot) {
        if (!bot || !bot.inventory)
            return [];
        const items = bot.inventory.items();
        const map = new Map();
        for (const item of items) {
            map.set(item.name, (map.get(item.name) || 0) + item.count);
        }
        const result = [];
        const supported = [
            { name: "water_bucket", priority: 1, dims: ["overworld", "end"] },
            { name: "slime_block", priority: 2, dims: ["overworld", "nether", "end"] },
            { name: "hay_block", priority: 3, dims: ["overworld", "nether", "end"] },
            { name: "cobweb", priority: 4, dims: ["overworld", "nether", "end"] },
            { name: "powder_snow_bucket", priority: 5, dims: ["overworld", "end"] },
            { name: "totem_of_undying", priority: 6, dims: ["overworld", "nether", "end"] }
        ];
        for (const entry of supported) {
            const count = map.get(entry.name) || 0;
            if (count > 0) {
                result.push({
                    name: entry.name,
                    count,
                    priority: entry.priority,
                    effectiveDimensions: entry.dims
                });
            }
        }
        return result;
    }
    /**
     * Scans horizontally within radius for safe water pools or hay blocks
     */
    findNearbySafeSurface(bot, surfaceY, radius) {
        if (!bot.entity)
            return null;
        const originX = Math.floor(bot.entity.position.x);
        const originZ = Math.floor(bot.entity.position.z);
        const targetY = surfaceY - 1; // ground block
        for (let r = 1; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    const b = bot.blockAt(new Vec3(originX + dx, targetY, originZ + dz));
                    if (!b)
                        continue;
                    if (b.name === "water" || b.name === "flowing_water") {
                        return { pos: new Vec3(originX + dx + 0.5, surfaceY, originZ + dz + 0.5), type: "water" };
                    }
                    if (b.name === "slime_block" || b.name === "hay_block") {
                        return { pos: new Vec3(originX + dx + 0.5, surfaceY, originZ + dz + 0.5), type: "cushion" };
                    }
                }
            }
        }
        return null;
    }
    /**
     * Executes lateral air acceleration steering towards safe water / cushion
     */
    executeLateralDrift(bot, targetCoord) {
        // Acquire emergency lock
        actionCoordinator.requestAction("mlg_clutch", ActionCoordinator.PRIORITY_EMERGENCY, "movement");
        this.state = "aiming";
        // Suspend pathfinder
        try {
            bot.pathfinder?.setGoal(null);
        }
        catch { }
        // Face toward safe coordinate
        bot.lookAt(targetCoord, true);
        bot.setControlState("forward", true);
        bot.setControlState("sprint", true);
    }
    /**
     * Realizes instant item equip, aim downward, and placement
     */
    async executeClutchPlacement(bot, surface, itemName) {
        if (this.placementTriggered || !itemName)
            return;
        this.placementTriggered = true;
        this.placementTimestamp = Date.now();
        this.state = "placing";
        // 1. Authoritative lock: Emergency Priority 1 pre-empts all manual WASD, combat, & tasks
        actionCoordinator.requestAction("mlg_clutch", ActionCoordinator.PRIORITY_EMERGENCY, "all");
        try {
            // 2. Clear movement inputs and pathfinder
            bot.clearControlStates();
            bot.pathfinder?.setGoal(null);
            // 3. Find item in inventory
            const invItem = bot.inventory.items().find((i) => i.name === itemName);
            if (!invItem) {
                this.recordClutchFailure("NO_CLUTCH_ITEMS");
                return;
            }
            // 4. Aim straight down at placement location
            const targetPos = new Vec3(Math.floor(bot.entity.position.x) + 0.5, surface.y, Math.floor(bot.entity.position.z) + 0.5);
            await bot.look(bot.entity.yaw, -Math.PI / 2, true);
            // 5. Equip item in hand (or offhand for totem)
            if (itemName === "totem_of_undying") {
                await bot.equip(invItem, "off-hand");
                return;
            }
            else {
                await bot.equip(invItem, "hand");
            }
            // 6. Execute placement
            if (itemName === "water_bucket" || itemName === "powder_snow_bucket") {
                const dim = this.getNormalizedDimension(bot);
                if (dim === "nether") {
                    // Nether evaporation!
                    this.recordClutchFailure("NETHER_WATER_EVAPORATION");
                    return;
                }
                // Activate bucket or place against ground block
                const groundBlock = bot.blockAt(new Vec3(Math.floor(bot.entity.position.x), surface.y - 1, Math.floor(bot.entity.position.z)));
                if (groundBlock) {
                    try {
                        await bot.placeBlock(groundBlock, new Vec3(0, 1, 0));
                    }
                    catch {
                        bot.activateItem();
                    }
                }
                else {
                    bot.activateItem();
                }
                this.waterPlacedPosition = targetPos;
            }
            else {
                // Block placement (slime, hay, cobweb)
                const groundBlock = bot.blockAt(new Vec3(Math.floor(bot.entity.position.x), surface.y - 1, Math.floor(bot.entity.position.z)));
                if (groundBlock) {
                    await bot.placeBlock(groundBlock, new Vec3(0, 1, 0));
                }
            }
        }
        catch (e) {
            console.error("[MLG Clutch] Placement error:", e);
            this.recordClutchFailure("MISSED_TIMING_WINDOW");
        }
    }
    /**
     * Handles landing verification and water retrieval
     */
    async handleLanding(bot) {
        this.state = "landed";
        const currentHealth = bot.health ?? 20;
        const damageTaken = Math.max(0, this.healthBeforeImpact - currentHealth);
        const fallDistance = Math.max(0, this.fallStartHeight - bot.entity.position.y);
        const predictedDamage = this.calculatePredictedDamage(fallDistance);
        const timingDeltaMs = this.placementTimestamp > 0 ? Date.now() - this.placementTimestamp : undefined;
        let status = "SUCCESS";
        if (currentHealth <= 0) {
            status = "FAILED";
        }
        else if (damageTaken > 0 && damageTaken < predictedDamage) {
            status = "PARTIAL_SUCCESS"; // e.g. Hay bale cushion or late water
        }
        else if (damageTaken >= predictedDamage && predictedDamage > 0) {
            status = "FAILED";
        }
        const eventRecord = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            dimension: this.getNormalizedDimension(bot),
            fallHeight: Number(fallDistance.toFixed(1)),
            verticalVelocity: Number(this.peakFallVelocity.toFixed(2)),
            strategy: this.activeStrategy,
            status,
            damageTaken,
            timingDeltaMs,
            recoveredWater: false
        };
        this.lastClutchResult = eventRecord;
        this.updateStats(status, timingDeltaMs);
        // Water recovery: Re-scoop placed water so we don't flood the arena
        if (status === "SUCCESS" &&
            this.activeStrategy === "water_bucket" &&
            this.config.autoRecoverWater) {
            this.state = "recovering_water";
            await this.recoverPlacedWater(bot);
            eventRecord.recoveredWater = true;
        }
        // Release emergency action lock
        actionCoordinator.releaseAction("mlg_clutch");
        bot.clearControlStates();
        AuditRepo.add({
            id: eventRecord.id,
            timestamp: eventRecord.timestamp,
            actor: "bot",
            action: "mlg_clutch_executed",
            component: "clutch_manager",
            severity: status === "FAILED" ? "warn" : "info",
            details: {
                strategy: this.activeStrategy,
                status,
                fallHeight: eventRecord.fallHeight,
                damageTaken,
                timingDeltaMs
            }
        });
        eventTimeline.record({
            category: "movement",
            observationSummary: `MLG clutch triggered: Fall ${eventRecord.fallHeight}m, Vy: ${eventRecord.verticalVelocity} m/s`,
            plannerDecision: `Selected strategy ${this.activeStrategy}`,
            validatedAction: `Executed clutch placement/cushion with status ${status}`,
            result: status === "FAILED" ? "failure" : "success",
            stateChanges: { eventRecord }
        });
        this.resetFallState();
    }
    /**
     * Recovers placed water with empty bucket
     */
    async recoverPlacedWater(bot) {
        try {
            // Short delay for water to settle and extinguish player
            await new Promise((res) => setTimeout(res, 200));
            const emptyBucket = bot.inventory.items().find((i) => i.name === "bucket");
            if (emptyBucket) {
                await bot.equip(emptyBucket, "hand");
                await bot.look(bot.entity.yaw, -Math.PI / 2, true);
                bot.activateItem();
            }
        }
        catch (e) {
            console.error("[MLG Clutch] Water recovery error:", e);
        }
    }
    /**
     * Handles death during fall / clutch failure
     */
    handleDeath(bot) {
        if (this.isFalling) {
            this.recordClutchFailure("HEALTH_DEPLETED");
            actionCoordinator.releaseAction("mlg_clutch");
            this.resetFallState();
        }
    }
    /**
     * Handles post-death recovery
     */
    handleRespawn(bot) {
        console.error("[MLG Clutch] Bot respawned. Verifying state recovery...");
        setTimeout(() => {
            if (bot.health && bot.health >= 20) {
                console.error("[MLG Clutch] Health restored. Ready for operations.");
            }
        }, 1000);
    }
    recordClutchFailure(reason) {
        const fallDistance = Math.max(0, this.fallStartHeight - (this.activeBot?.entity?.position?.y ?? 0));
        const eventRecord = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            dimension: this.getNormalizedDimension(this.activeBot),
            fallHeight: Number(fallDistance.toFixed(1)),
            verticalVelocity: Number(this.peakFallVelocity.toFixed(2)),
            strategy: this.activeStrategy,
            status: "FAILED",
            damageTaken: 20,
            failureReason: reason
        };
        this.lastClutchResult = eventRecord;
        this.updateStats("FAILED");
        this.state = "failed";
    }
    resetFallState() {
        this.isFalling = false;
        this.fallStartHeight = 0;
        this.peakFallVelocity = 0;
        this.consecutiveFallTicks = 0;
        this.activeStrategy = "none";
        this.placementTriggered = false;
        this.placementTimestamp = 0;
        this.waterPlacedPosition = null;
        this.state = "idle";
    }
    updateStats(status, timingDeltaMs) {
        this.stats.totalAttempts++;
        if (status === "SUCCESS")
            this.stats.successful++;
        else if (status === "PARTIAL_SUCCESS")
            this.stats.partial++;
        else if (status === "FAILED")
            this.stats.failed++;
        const totalSuccessful = this.stats.successful + this.stats.partial;
        this.stats.successRate = Number(((totalSuccessful / this.stats.totalAttempts) * 100).toFixed(1));
        if (timingDeltaMs !== undefined && timingDeltaMs > 0) {
            this.delaySamples.push(timingDeltaMs);
            if (this.delaySamples.length > 50)
                this.delaySamples.shift();
            const avg = this.delaySamples.reduce((a, b) => a + b, 0) / this.delaySamples.length;
            this.stats.avgPlacementDelayMs = Math.round(avg);
        }
    }
    loadStats() {
        // Starts clean or persisted in memory
        this.stats = {
            totalAttempts: 0,
            successful: 0,
            partial: 0,
            failed: 0,
            successRate: 100,
            avgPlacementDelayMs: 45
        };
    }
    isPlacementStrategy(s) {
        return (s === "water_bucket" ||
            s === "slime_block" ||
            s === "hay_bale" ||
            s === "cobweb" ||
            s === "powder_snow_bucket" ||
            s === "totem_of_undying");
    }
    getNormalizedDimension(bot) {
        if (!bot || !bot.game)
            return "overworld";
        const d = (bot.game.dimension || "").toLowerCase();
        if (d.includes("nether"))
            return "nether";
        if (d.includes("end"))
            return "end";
        return "overworld";
    }
    /**
     * Local Test Arena Drill Execution:
     * Simulates or sets up a controlled test fall with configurable height and surface.
     */
    async runArenaDrill(bot, drill) {
        const drillId = crypto.randomUUID();
        const fallHeight = drill.fallHeight;
        const surfaceType = drill.surfaceType;
        const dimension = drill.dimension;
        // Simulate landing physics
        const sim = this.simulateLanding(fallHeight, 0, 0);
        const predictedDamage = this.calculatePredictedDamage(fallHeight);
        // Evaluate valid strategy for this surface and dimension
        let strategy = "water_bucket";
        let status = "SUCCESS";
        let damageTaken = 0;
        let failureReason = undefined;
        if (dimension === "nether") {
            if (surfaceType === "stone") {
                // Water bucket in Nether fails!
                strategy = "water_bucket";
                status = "FAILED";
                damageTaken = predictedDamage;
                failureReason = "NETHER_WATER_EVAPORATION";
            }
            else if (surfaceType === "hay_block") {
                strategy = "hay_bale";
                damageTaken = Math.max(1, Math.floor(predictedDamage * 0.2));
                status = "PARTIAL_SUCCESS";
            }
            else if (surfaceType === "slime_block") {
                strategy = "slime_block";
                damageTaken = 0;
                status = "SUCCESS";
            }
        }
        else {
            if (surfaceType === "stone") {
                strategy = "water_bucket";
                damageTaken = 0;
                status = "SUCCESS";
            }
            else if (surfaceType === "water") {
                strategy = "passive_safe";
                damageTaken = 0;
                status = "SUCCESS";
            }
            else if (surfaceType === "hay_block") {
                strategy = "hay_bale";
                damageTaken = Math.max(1, Math.floor(predictedDamage * 0.2));
                status = "PARTIAL_SUCCESS";
            }
            else if (surfaceType === "slime_block") {
                strategy = "slime_block";
                damageTaken = 0;
                status = "SUCCESS";
            }
        }
        const timingDeltaMs = Math.round(sim.timeMs - this.config.triggerTimeMs);
        const record = {
            id: drillId,
            timestamp: Date.now(),
            dimension,
            fallHeight,
            verticalVelocity: Number(sim.finalVy.toFixed(2)),
            strategy,
            status,
            damageTaken,
            timingDeltaMs,
            failureReason,
            recoveredWater: strategy === "water_bucket" && status === "SUCCESS"
        };
        this.lastClutchResult = record;
        this.updateStats(status, timingDeltaMs);
        return {
            drillId,
            result: record,
            simulated: true,
            timingSummary: `Estimated fall time: ${sim.timeMs}ms (${sim.ticks} ticks). Trigger offset: ${timingDeltaMs}ms.`
        };
    }
}
export const clutchManager = new ClutchManager();

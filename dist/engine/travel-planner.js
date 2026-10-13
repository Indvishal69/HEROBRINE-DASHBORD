import { foodManager } from "./food-manager.js";
import { worldIntelligence } from "./world-intelligence.js";
export class TravelPlanner {
    convertNetherCoordinates(pos, fromDimension) {
        if (fromDimension === "overworld") {
            return {
                x: Math.round(pos.x / 8),
                y: pos.y,
                z: Math.round(pos.z / 8)
            };
        }
        else {
            return {
                x: Math.round(pos.x * 8),
                y: pos.y,
                z: Math.round(pos.z * 8)
            };
        }
    }
    checkTravelReadiness(bot, targetPos, targetDimension = "overworld") {
        const checklist = [];
        if (!bot || !bot.entity) {
            return {
                ready: false,
                targetDimension,
                checklist: [{ requirement: "Bot Connected", satisfied: false, details: "Bot is offline" }],
                estimatedCostBlocks: 0
            };
        }
        const currentPos = bot.entity.position;
        const dist = Math.round(Math.sqrt(Math.pow(currentPos.x - targetPos.x, 2) +
            Math.pow(currentPos.z - targetPos.z, 2)));
        // 1. Food Forecast Check
        const estMinutes = Math.max(5, Math.ceil(dist / 100) * 3);
        const foodForecast = foodManager.forecastFoodSupply(bot, estMinutes);
        checklist.push({
            requirement: "Food Supply",
            satisfied: foodForecast.sufficient,
            details: `${foodForecast.currentAvailable} food points available (estimated ${foodForecast.estimatedNeeded} needed)`
        });
        // 2. Weapon & Pickaxe Durability Check
        const pickaxe = bot.inventory.items().find((i) => i.name.endsWith("_pickaxe"));
        checklist.push({
            requirement: "Pickaxe Available",
            satisfied: Boolean(pickaxe),
            details: pickaxe ? `Equipped: ${pickaxe.name}` : "No pickaxe in inventory for obstacles"
        });
        // 3. Nether Specific Requirements (Gold armor to avoid Piglin hostility)
        if (targetDimension === "the_nether") {
            const goldPiece = bot.inventory.items().find((i) => i.name.startsWith("golden_"));
            checklist.push({
                requirement: "Golden Armor Piece",
                satisfied: Boolean(goldPiece),
                details: goldPiece ? `Has ${goldPiece.name} for Piglin pacification` : "Missing gold armor piece! Piglins will attack on sight."
            });
        }
        // 4. Return Route & Home Anchor
        const home = worldIntelligence.findNearest({ x: currentPos.x, y: currentPos.y, z: currentPos.z }, "home", targetDimension);
        checklist.push({
            requirement: "Known Return Anchor",
            satisfied: Boolean(home),
            details: home ? `Anchor point: ${home.landmark.name} (${home.distance}m)` : "No home or base anchor logged in world memory"
        });
        const ready = checklist.every((c) => c.satisfied);
        return {
            ready,
            targetDimension,
            checklist,
            estimatedCostBlocks: dist
        };
    }
}
export const travelPlanner = new TravelPlanner();

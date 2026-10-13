import { PermissionRepo } from "../storage/database.js";
export class ChatIntentParser {
    parse(username, rawMessage, triggerPrefix = "@nexus") {
        const cleanMsg = rawMessage.trim();
        const isDirect = cleanMsg.toLowerCase().startsWith(triggerPrefix.toLowerCase()) ||
            cleanMsg.toLowerCase().includes("nexus") ||
            cleanMsg.toLowerCase().includes("buddy");
        // Check player permissions
        let perm = PermissionRepo.get(username);
        if (!perm) {
            // Default auto-grant guest permission
            perm = {
                username,
                role: "guest",
                canCommandBot: true,
                canRequestMining: false,
                canRequestBuilding: false,
                canRequestStorage: false,
                canUseOpActions: false,
                updatedAt: Date.now()
            };
            PermissionRepo.upsert(perm);
        }
        if (perm.role === "blocked") {
            return {
                isCommand: false,
                type: "ignored",
                title: "Blocked Player",
                params: {},
                feedbackMessage: ""
            };
        }
        // Strip trigger prefix
        let content = cleanMsg;
        if (content.toLowerCase().startsWith(triggerPrefix.toLowerCase())) {
            content = content.slice(triggerPrefix.length).trim();
        }
        const lower = content.toLowerCase();
        // 1. STOP COMMAND
        if (/^stop|halt|freeze|cancel$/i.test(lower)) {
            return {
                isCommand: true,
                type: "goto",
                title: "Emergency Stop",
                params: { action: "stop" },
                feedbackMessage: `Stopping current actions as requested by ${username}.`
            };
        }
        // 2. FOLLOW COMMAND
        if (/follow(\s+me)?/i.test(lower)) {
            const target = lower.includes("follow me") || !lower.replace("follow", "").trim()
                ? username
                : content.replace(/follow/i, "").trim();
            return {
                isCommand: true,
                type: "follow",
                title: `Follow ${target}`,
                params: { player_name: target },
                feedbackMessage: `Following ${target}.`
            };
        }
        // 3. COME HERE / GOTO
        if (/come(\s+here|\s+to\s+me)?/i.test(lower)) {
            return {
                isCommand: true,
                type: "goto",
                title: `Navigate to ${username}`,
                params: { player_name: username, target: "player" },
                feedbackMessage: `Coming to your location, ${username}!`
            };
        }
        // 4. MINE / GATHER RESOURCE
        if (/mine|gather|collect/i.test(lower)) {
            if (!perm.canRequestMining && perm.role !== "owner" && perm.role !== "admin") {
                return {
                    isCommand: false,
                    type: "unauthorized",
                    title: "Permission Denied",
                    params: {},
                    feedbackMessage: `Sorry ${username}, you do not have permission to schedule mining tasks.`
                };
            }
            let resource = "wood";
            if (lower.includes("iron"))
                resource = "iron_ore";
            else if (lower.includes("coal"))
                resource = "coal_ore";
            else if (lower.includes("stone") || lower.includes("cobble"))
                resource = "cobblestone";
            else if (lower.includes("diamond"))
                resource = "diamond_ore";
            else if (lower.includes("wood") || lower.includes("log") || lower.includes("tree"))
                resource = "wood";
            return {
                isCommand: true,
                type: "mine",
                title: `Mine ${resource}`,
                params: { resource, limit: 16 },
                feedbackMessage: `Starting resource collection task for ${resource}!`
            };
        }
        // 5. FARM / HARVEST
        if (/harvest|farm|crops|wheat/i.test(lower)) {
            return {
                isCommand: true,
                type: "harvest",
                title: "Harvest Crops",
                params: { replant: true },
                feedbackMessage: `Checking nearby crops to harvest and replant.`
            };
        }
        // 6. BUILD BLUEPRINT
        if (/build|construct/i.test(lower)) {
            if (!perm.canRequestBuilding && perm.role !== "owner" && perm.role !== "admin") {
                return {
                    isCommand: false,
                    type: "unauthorized",
                    title: "Permission Denied",
                    params: {},
                    feedbackMessage: `Sorry ${username}, building requires authorized permissions.`
                };
            }
            return {
                isCommand: true,
                type: "build",
                title: "Build Structure",
                params: { blueprintName: "shelter" },
                feedbackMessage: `Checking blueprint and materials to begin construction.`
            };
        }
        // 7. STATUS / INVENTORY INQUIRY
        if (/status|inventory|what are you doing|doing/i.test(lower)) {
            return {
                isCommand: true,
                type: "chat_reply",
                title: "Status Check",
                params: { query: "status" },
                feedbackMessage: `I am active and monitoring the world.`
            };
        }
        // Default conversational AI reply if addressed
        if (isDirect) {
            return {
                isCommand: false,
                type: "chat_reply",
                title: "Conversational Chat",
                params: { message: content },
                feedbackMessage: ""
            };
        }
        return {
            isCommand: false,
            type: "ignored",
            title: "Ambient Chat",
            params: {},
            feedbackMessage: ""
        };
    }
}
export const chatIntentParser = new ChatIntentParser();

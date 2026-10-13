export class CapabilityRegistry {
    capabilities = new Map();
    constructor() {
        this.registerDefaults();
    }
    register(cap) {
        this.capabilities.set(cap.id, cap);
    }
    get(id) {
        return this.capabilities.get(id);
    }
    getAll() {
        return Array.from(this.capabilities.values());
    }
    getByStatus(status) {
        return this.getAll().filter((c) => c.status === status);
    }
    registerDefaults() {
        const list = [
            {
                id: "mineflayer_connection",
                name: "Minecraft 1.21.x Protocol Connection",
                category: "core",
                status: "implemented_tested",
                description: "Mineflayer client connection with Paper/Spigot 1.21.1 protocol negotiation and auto-reconnect",
                minAutonomyLevel: 0,
                requiredVersion: "1.21.x",
                lastTestedAt: Date.now()
            },
            {
                id: "prismarine_3d_viewer",
                name: "Prismarine 3D Live World Viewer",
                category: "core",
                status: "implemented_tested",
                description: "Browser-rendered chunk and entity viewport reverse-proxied at /viewer/",
                minAutonomyLevel: 0,
                lastTestedAt: Date.now()
            },
            {
                id: "multi_key_ai_pool",
                name: "5-Key Multi-Provider API Pool",
                category: "ai",
                status: "implemented_tested",
                description: "AES-256-GCM encrypted key storage, HTTP 429 rate limit backoff, Groq 404 model auto-failover",
                minAutonomyLevel: 0,
                lastTestedAt: Date.now()
            },
            {
                id: "smart_food_auto_eat",
                name: "Smart Food & Hunger Management",
                category: "survival",
                status: "implemented_tested",
                description: "10-step eating controller with real 1.21.x item metadata, saturation weighting, and banned foods filter",
                minAutonomyLevel: 2,
                lastTestedAt: Date.now()
            },
            {
                id: "pvp_combat_ai",
                name: "Advanced PvP & Combat Controller",
                category: "combat",
                status: "implemented_tested",
                description: "7-state deterministic machine, weapon cooldown timing, offhand shield, strict allowlist and emergency retreat",
                minAutonomyLevel: 5,
                limitations: ["Disabled by default; requires explicit owner configuration and target approval"],
                lastTestedAt: Date.now()
            },
            {
                id: "action_coordinator",
                name: "Authoritative Action Scheduler",
                category: "core",
                status: "implemented_tested",
                description: "Unified lock manager with priority preemption ensuring survival, combat, and tasks do not conflict",
                minAutonomyLevel: 1,
                lastTestedAt: Date.now()
            },
            {
                id: "mining_resource_gathering",
                name: "Autonomous Mining & Resource Gathering",
                category: "survival",
                status: "implemented_tested",
                description: "Pathfinding to ore blocks, tool affinity matching, and drop collection",
                minAutonomyLevel: 3,
                lastTestedAt: Date.now()
            },
            {
                id: "farming_crop_manager",
                name: "Crop Farming & Replanting",
                category: "survival",
                status: "implemented_tested",
                description: "Maturity detection for wheat, carrots, potatoes, beetroots with automatic replanting",
                minAutonomyLevel: 3,
                lastTestedAt: Date.now()
            },
            {
                id: "blueprint_construction",
                name: "Architectural Blueprint Construction",
                category: "building",
                status: "implemented_tested",
                description: "Bottom-up layer placement with material manifest calculation and repair discrepancy scanning",
                minAutonomyLevel: 3,
                lastTestedAt: Date.now()
            },
            {
                id: "reversible_transactions",
                name: "Reversible Build Transactions",
                category: "building",
                status: "implemented_tested",
                description: "Transaction journal recording placed blocks with pre-state verification and conflict-safe rollback",
                minAutonomyLevel: 3,
                lastTestedAt: Date.now()
            },
            {
                id: "world_intelligence_engine",
                name: "World Intelligence & Spatial Model",
                category: "world",
                status: "implemented_tested",
                description: "Persistent landmark memory, travel routes, hazard zones, and freshness expiration",
                minAutonomyLevel: 1,
                lastTestedAt: Date.now()
            },
            {
                id: "campaign_planner",
                name: "Long-Horizon Campaign Planner",
                category: "core",
                status: "implemented_tested",
                description: "Multi-stage dependency graphs for starter bases, storage networks, and expeditions",
                minAutonomyLevel: 4,
                lastTestedAt: Date.now()
            },
            {
                id: "voice_control_interface",
                name: "Browser Voice Push-To-Talk",
                category: "social",
                status: "implemented_tested",
                description: "Web Speech API microphone recognition with transcription preview and role-based validation",
                minAutonomyLevel: 1,
                lastTestedAt: Date.now()
            },
            {
                id: "multimodal_vision",
                name: "Multimodal Vision Analysis",
                category: "ai",
                status: "implemented_with_limitations",
                description: "On-demand viewer scene capture for vision-capable models (OpenAI/OpenRouter)",
                minAutonomyLevel: 4,
                limitations: ["Screenshots captured on-demand from 3D viewer; rate-limited to preserve token budget"],
                lastTestedAt: Date.now()
            },
            {
                id: "villager_trading_economy",
                name: "Villager Trading & Economy Planner",
                category: "economy",
                status: "implemented_tested",
                description: "Scans nearby villager trade offers, verifies inventory reserves, and enforces protected items policy",
                minAutonomyLevel: 4,
                lastTestedAt: Date.now()
            },
            {
                id: "elytra_flight",
                name: "Elytra Flight & Aerial Navigation",
                category: "world",
                status: "unsupported_configuration",
                description: "High-speed Elytra gliding with firework rocketry",
                minAutonomyLevel: 5,
                limitations: ["Requires specialized client physics mod not supported in standard Mineflayer protocol"]
            }
        ];
        for (const c of list) {
            this.register(c);
        }
    }
}
export const capabilityRegistry = new CapabilityRegistry();

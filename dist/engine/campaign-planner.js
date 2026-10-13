import crypto from "node:crypto";
import { AppSettingsRepo, AuditRepo } from "../storage/database.js";
export class CampaignPlanner {
    campaigns = new Map();
    activeCampaignId = null;
    constructor() {
        this.loadCampaigns();
        this.seedDefaultTemplates();
    }
    loadCampaigns() {
        const saved = AppSettingsRepo.get("campaigns_list", []);
        for (const c of saved) {
            this.campaigns.set(c.id, c);
            if (c.status === "in_progress") {
                this.activeCampaignId = c.id;
            }
        }
    }
    saveCampaigns() {
        AppSettingsRepo.set("campaigns_list", Array.from(this.campaigns.values()));
    }
    getAll() {
        return Array.from(this.campaigns.values());
    }
    get(id) {
        return this.campaigns.get(id);
    }
    getActive() {
        return this.activeCampaignId ? this.campaigns.get(this.activeCampaignId) || null : null;
    }
    createCampaign(title, description, category, stages) {
        const id = crypto.randomUUID();
        const now = Date.now();
        const record = {
            id,
            title,
            description,
            category,
            stages: stages.map((s, idx) => ({
                ...s,
                id: `${id}-stage-${idx + 1}`,
                retriesUsed: 0,
                status: "pending"
            })),
            currentStageIndex: 0,
            status: "pending",
            createdAt: now,
            updatedAt: now
        };
        this.campaigns.set(id, record);
        this.saveCampaigns();
        AuditRepo.add({
            id: crypto.randomUUID(),
            timestamp: now,
            actor: "user",
            action: "campaign_created",
            component: "campaign_planner",
            severity: "info",
            details: { campaignId: id, title, stagesCount: stages.length }
        });
        return record;
    }
    startCampaign(id) {
        const campaign = this.campaigns.get(id);
        if (!campaign)
            return false;
        if (this.activeCampaignId && this.activeCampaignId !== id) {
            const current = this.campaigns.get(this.activeCampaignId);
            if (current && current.status === "in_progress") {
                current.status = "paused";
            }
        }
        campaign.status = "in_progress";
        campaign.updatedAt = Date.now();
        if (campaign.stages[campaign.currentStageIndex]) {
            campaign.stages[campaign.currentStageIndex].status = "running";
        }
        this.activeCampaignId = id;
        this.saveCampaigns();
        return true;
    }
    pauseCampaign(id) {
        const campaign = this.campaigns.get(id);
        if (!campaign || campaign.status !== "in_progress")
            return false;
        campaign.status = "paused";
        campaign.updatedAt = Date.now();
        if (campaign.stages[campaign.currentStageIndex]) {
            campaign.stages[campaign.currentStageIndex].status = "pending";
        }
        if (this.activeCampaignId === id) {
            this.activeCampaignId = null;
        }
        this.saveCampaigns();
        return true;
    }
    cancelCampaign(id) {
        const campaign = this.campaigns.get(id);
        if (!campaign)
            return false;
        campaign.status = "cancelled";
        campaign.updatedAt = Date.now();
        if (this.activeCampaignId === id) {
            this.activeCampaignId = null;
        }
        this.saveCampaigns();
        return true;
    }
    advanceStage(id, completionEvidence = "Stage goals verified") {
        const campaign = this.campaigns.get(id);
        if (!campaign || campaign.status !== "in_progress")
            return false;
        const currentStage = campaign.stages[campaign.currentStageIndex];
        if (currentStage) {
            currentStage.status = "completed";
            currentStage.completionEvidence = completionEvidence;
        }
        campaign.currentStageIndex++;
        campaign.updatedAt = Date.now();
        if (campaign.currentStageIndex >= campaign.stages.length) {
            campaign.status = "completed";
            campaign.completedAt = Date.now();
            this.activeCampaignId = null;
        }
        else {
            campaign.stages[campaign.currentStageIndex].status = "running";
        }
        this.saveCampaigns();
        return true;
    }
    seedDefaultTemplates() {
        if (this.campaigns.size > 0)
            return;
        // 1. Starter Base Campaign
        this.createCampaign("Establish Starter Base", "Gather initial timber, stone tools, and erect a safe overnight shelter.", "starter_base", [
            {
                name: "Gather Wood & Craft Workbench",
                description: "Harvest 16 oak logs and craft crafting table and wooden pickaxe",
                requiredMaterials: { oak_log: 16 },
                preconditions: ["Safe daylight conditions"],
                difficulty: "easy",
                retryBudget: 3
            },
            {
                name: "Mine Cobblestone & Upgrade Tools",
                description: "Mine 32 cobblestone and craft stone tools and furnace",
                requiredMaterials: { cobblestone: 32 },
                preconditions: ["Wooden pickaxe in inventory"],
                difficulty: "easy",
                retryBudget: 3
            },
            {
                name: "Construct Shelter",
                description: "Build 5x5 wooden and cobblestone shelter with door",
                requiredMaterials: { cobblestone: 24, oak_planks: 32 },
                preconditions: ["Flat terrain selected"],
                difficulty: "medium",
                retryBudget: 2
            }
        ]);
        // 2. Renewable Food Campaign
        this.createCampaign("Establish Renewable Food Supply", "Construct irrigated farmland and plant wheat, carrots, and potatoes.", "renewable_supplies", [
            {
                name: "Craft Stone Hoe & Gather Seeds",
                description: "Craft hoe and gather 16 wheat seeds from grass",
                requiredMaterials: { wheat_seeds: 16 },
                preconditions: ["Cobblestone in inventory"],
                difficulty: "easy",
                retryBudget: 3
            },
            {
                name: "Till Farmland & Plant Crops",
                description: "Till 16 blocks within 4 blocks of water and plant seeds",
                requiredMaterials: { wheat_seeds: 16 },
                preconditions: ["Water source located"],
                difficulty: "medium",
                retryBudget: 2
            }
        ]);
    }
}
export const campaignPlanner = new CampaignPlanner();

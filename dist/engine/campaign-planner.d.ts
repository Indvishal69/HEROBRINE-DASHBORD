import type { CampaignRecord, CampaignStage, CampaignCategory } from "../types/campaigns.js";
export declare class CampaignPlanner {
    private campaigns;
    private activeCampaignId;
    constructor();
    private loadCampaigns;
    private saveCampaigns;
    getAll(): CampaignRecord[];
    get(id: string): CampaignRecord | undefined;
    getActive(): CampaignRecord | null;
    createCampaign(title: string, description: string, category: CampaignCategory, stages: Array<Omit<CampaignStage, "id" | "retriesUsed" | "status">>): CampaignRecord;
    startCampaign(id: string): boolean;
    pauseCampaign(id: string): boolean;
    cancelCampaign(id: string): boolean;
    advanceStage(id: string, completionEvidence?: string): boolean;
    private seedDefaultTemplates;
}
export declare const campaignPlanner: CampaignPlanner;

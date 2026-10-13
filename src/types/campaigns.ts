export type CampaignCategory =
  | "starter_base"
  | "storage_network"
  | "renewable_supplies"
  | "exploration"
  | "construction"
  | "survival_milestone"
  | "custom";

export type CampaignStatus = "pending" | "in_progress" | "paused" | "completed" | "failed" | "cancelled";

export interface CampaignStage {
  id: string;
  name: string;
  description: string;
  requiredMaterials: Record<string, number>;
  preconditions: string[];
  difficulty: "easy" | "medium" | "hard";
  retryBudget: number;
  retriesUsed: number;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  blockedReason?: string;
  completionEvidence?: string;
  taskId?: string;
}

export interface CampaignRecord {
  id: string;
  title: string;
  description: string;
  category: CampaignCategory;
  stages: CampaignStage[];
  currentStageIndex: number;
  status: CampaignStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}

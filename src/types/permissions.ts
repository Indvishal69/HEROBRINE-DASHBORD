export type PlayerRole = "owner" | "admin" | "trusted" | "guest" | "blocked";

export interface PlayerPermissionRecord {
  username: string;
  role: PlayerRole;
  canCommandBot: boolean;
  canRequestMining: boolean;
  canRequestBuilding: boolean;
  canRequestStorage: boolean;
  canUseOpActions: boolean;
  notes?: string;
  updatedAt: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  component: string;
  severity: "info" | "warn" | "error" | "security";
  details: Record<string, unknown>;
}

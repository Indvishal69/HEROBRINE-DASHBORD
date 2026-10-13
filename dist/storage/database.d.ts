import { DatabaseSync } from "node:sqlite";
import type { AICredentialEntry } from "../types/ai.js";
import type { TaskRecord, BlueprintRecord } from "../types/tasks.js";
import type { LandmarkRecord } from "../types/memory.js";
import type { PlayerPermissionRecord, AuditLogEntry } from "../types/permissions.js";
export declare function getDatabase(): DatabaseSync;
export declare const CredentialRepo: {
    getAll(): AICredentialEntry[];
    get(id: string): AICredentialEntry | null;
    upsert(c: AICredentialEntry): void;
    delete(id: string): void;
};
export declare const TaskRepo: {
    getAll(): TaskRecord[];
    get(id: string): TaskRecord | null;
    upsert(t: TaskRecord): void;
    delete(id: string): void;
};
export declare const BlueprintRepo: {
    getAll(): BlueprintRecord[];
    get(id: string): BlueprintRecord | null;
    upsert(b: BlueprintRecord): void;
    delete(id: string): void;
};
export declare const LandmarkRepo: {
    getAll(): LandmarkRecord[];
    upsert(l: LandmarkRecord): void;
    delete(id: string): void;
};
export declare const PermissionRepo: {
    getAll(): PlayerPermissionRecord[];
    get(username: string): PlayerPermissionRecord | null;
    upsert(p: PlayerPermissionRecord): void;
    delete(username: string): void;
};
export declare const AuditRepo: {
    add(log: AuditLogEntry): void;
    getRecent(limit?: number): AuditLogEntry[];
};
export declare const AppSettingsRepo: {
    get<T>(key: string, defaultValue: T): T;
    set(key: string, value: unknown): void;
};

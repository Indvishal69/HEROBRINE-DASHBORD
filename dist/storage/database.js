import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
let dbInstance = null;
export function getDatabase() {
    if (dbInstance)
        return dbInstance;
    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, "nexus.db");
    dbInstance = new DatabaseSync(dbPath);
    // Enable WAL mode & foreign keys for concurrency & data integrity
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    initSchema(dbInstance);
    return dbInstance;
}
function initSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS api_credentials (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      base_url TEXT NOT NULL,
      preferred_model TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      health TEXT NOT NULL DEFAULT 'healthy',
      last_used_at INTEGER,
      last_success_at INTEGER,
      last_error_at INTEGER,
      last_error_msg TEXT,
      rate_limit_reset_at INTEGER,
      requests_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      latency_avg_ms REAL DEFAULT 0,
      spend_budget_limit REAL DEFAULT 0,
      current_spend_estimated REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      requested_by TEXT NOT NULL DEFAULT 'dashboard',
      priority INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      error TEXT,
      checkpoint_json TEXT,
      params_json TEXT
    );

    CREATE TABLE IF NOT EXISTS blueprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      dim_x INTEGER NOT NULL DEFAULT 1,
      dim_y INTEGER NOT NULL DEFAULT 1,
      dim_z INTEGER NOT NULL DEFAULT 1,
      total_blocks INTEGER NOT NULL DEFAULT 0,
      required_materials_json TEXT,
      blocks_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS landmarks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'poi',
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      dimension TEXT NOT NULL DEFAULT 'overworld',
      description TEXT,
      tags_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS container_memories (
      id TEXT PRIMARY KEY,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      dimension TEXT NOT NULL DEFAULT 'overworld',
      container_type TEXT NOT NULL DEFAULT 'chest',
      items_summary_json TEXT,
      last_inspected_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_permissions (
      username TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'guest',
      can_command INTEGER NOT NULL DEFAULT 1,
      can_mine INTEGER NOT NULL DEFAULT 0,
      can_build INTEGER NOT NULL DEFAULT 0,
      can_storage INTEGER NOT NULL DEFAULT 0,
      can_op INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      component TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      details_json TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
  `);
}
// ======================== API CREDENTIALS REPOSITORY ========================
export const CredentialRepo = {
    getAll() {
        const db = getDatabase();
        const rows = db.prepare("SELECT * FROM api_credentials ORDER BY requests_count ASC").all();
        return rows.map((r) => ({
            id: r.id,
            label: r.label,
            provider: r.provider,
            encryptedKey: r.encrypted_key,
            iv: r.iv,
            tag: r.tag,
            baseUrl: r.base_url,
            preferredModel: r.preferred_model,
            enabled: Boolean(r.enabled),
            health: r.health,
            lastUsedAt: r.last_used_at ?? undefined,
            lastSuccessAt: r.last_success_at ?? undefined,
            lastErrorAt: r.last_error_at ?? undefined,
            lastErrorMessage: r.last_error_msg ?? undefined,
            rateLimitResetAt: r.rate_limit_reset_at ?? undefined,
            requestsCount: r.requests_count,
            failureCount: r.failure_count,
            latencyAvgMs: r.latency_avg_ms ?? undefined,
            spendBudgetLimit: r.spend_budget_limit ?? undefined,
            currentSpendEstimated: r.current_spend_estimated ?? undefined
        }));
    },
    get(id) {
        const db = getDatabase();
        const r = db.prepare("SELECT * FROM api_credentials WHERE id = ?").get(id);
        if (!r)
            return null;
        return {
            id: r.id,
            label: r.label,
            provider: r.provider,
            encryptedKey: r.encrypted_key,
            iv: r.iv,
            tag: r.tag,
            baseUrl: r.base_url,
            preferredModel: r.preferred_model,
            enabled: Boolean(r.enabled),
            health: r.health,
            lastUsedAt: r.last_used_at ?? undefined,
            lastSuccessAt: r.last_success_at ?? undefined,
            lastErrorAt: r.last_error_at ?? undefined,
            lastErrorMessage: r.last_error_msg ?? undefined,
            rateLimitResetAt: r.rate_limit_reset_at ?? undefined,
            requestsCount: r.requests_count,
            failureCount: r.failure_count,
            latencyAvgMs: r.latency_avg_ms ?? undefined,
            spendBudgetLimit: r.spend_budget_limit ?? undefined,
            currentSpendEstimated: r.current_spend_estimated ?? undefined
        };
    },
    upsert(c) {
        const db = getDatabase();
        db.prepare(`
      INSERT INTO api_credentials (
        id, label, provider, encrypted_key, iv, tag, base_url, preferred_model,
        enabled, health, last_used_at, last_success_at, last_error_at, last_error_msg,
        rate_limit_reset_at, requests_count, failure_count, latency_avg_ms,
        spend_budget_limit, current_spend_estimated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label=excluded.label,
        provider=excluded.provider,
        encrypted_key=excluded.encrypted_key,
        iv=excluded.iv,
        tag=excluded.tag,
        base_url=excluded.base_url,
        preferred_model=excluded.preferred_model,
        enabled=excluded.enabled,
        health=excluded.health,
        last_used_at=excluded.last_used_at,
        last_success_at=excluded.last_success_at,
        last_error_at=excluded.last_error_at,
        last_error_msg=excluded.last_error_msg,
        rate_limit_reset_at=excluded.rate_limit_reset_at,
        requests_count=excluded.requests_count,
        failure_count=excluded.failure_count,
        latency_avg_ms=excluded.latency_avg_ms,
        spend_budget_limit=excluded.spend_budget_limit,
        current_spend_estimated=excluded.current_spend_estimated
    `).run(c.id, c.label, c.provider, c.encryptedKey, c.iv, c.tag, c.baseUrl, c.preferredModel, c.enabled ? 1 : 0, c.health, c.lastUsedAt ?? null, c.lastSuccessAt ?? null, c.lastErrorAt ?? null, c.lastErrorMessage ?? null, c.rateLimitResetAt ?? null, c.requestsCount, c.failureCount, c.latencyAvgMs ?? 0, c.spendBudgetLimit ?? 0, c.currentSpendEstimated ?? 0);
    },
    delete(id) {
        const db = getDatabase();
        db.prepare("DELETE FROM api_credentials WHERE id = ?").run(id);
    }
};
// ======================== TASKS REPOSITORY ========================
export const TaskRepo = {
    getAll() {
        const db = getDatabase();
        const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100").all();
        return rows.map((r) => ({
            id: r.id,
            type: r.type,
            title: r.title,
            description: r.description ?? undefined,
            requestedBy: r.requested_by,
            priority: r.priority,
            status: r.status,
            createdAt: r.created_at,
            startedAt: r.started_at ?? undefined,
            completedAt: r.completed_at ?? undefined,
            error: r.error ?? undefined,
            checkpoint: r.checkpoint_json ? JSON.parse(r.checkpoint_json) : undefined,
            params: r.params_json ? JSON.parse(r.params_json) : {}
        }));
    },
    get(id) {
        const db = getDatabase();
        const r = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
        if (!r)
            return null;
        return {
            id: r.id,
            type: r.type,
            title: r.title,
            description: r.description ?? undefined,
            requestedBy: r.requested_by,
            priority: r.priority,
            status: r.status,
            createdAt: r.created_at,
            startedAt: r.started_at ?? undefined,
            completedAt: r.completed_at ?? undefined,
            error: r.error ?? undefined,
            checkpoint: r.checkpoint_json ? JSON.parse(r.checkpoint_json) : undefined,
            params: r.params_json ? JSON.parse(r.params_json) : {}
        };
    },
    upsert(t) {
        const db = getDatabase();
        db.prepare(`
      INSERT INTO tasks (
        id, type, title, description, requested_by, priority, status,
        created_at, started_at, completed_at, error, checkpoint_json, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        description=excluded.description,
        priority=excluded.priority,
        status=excluded.status,
        started_at=excluded.started_at,
        completed_at=excluded.completed_at,
        error=excluded.error,
        checkpoint_json=excluded.checkpoint_json,
        params_json=excluded.params_json
    `).run(t.id, t.type, t.title, t.description ?? null, t.requestedBy, t.priority, t.status, t.createdAt, t.startedAt ?? null, t.completedAt ?? null, t.error ?? null, t.checkpoint ? JSON.stringify(t.checkpoint) : null, JSON.stringify(t.params || {}));
    },
    delete(id) {
        const db = getDatabase();
        db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    }
};
// ======================== BLUEPRINTS REPOSITORY ========================
export const BlueprintRepo = {
    getAll() {
        const db = getDatabase();
        const rows = db.prepare("SELECT * FROM blueprints ORDER BY created_at DESC").all();
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description ?? undefined,
            dimensions: { x: r.dim_x, y: r.dim_y, z: r.dim_z },
            totalBlocks: r.total_blocks,
            requiredMaterials: r.required_materials_json ? JSON.parse(r.required_materials_json) : {},
            blocks: JSON.parse(r.blocks_json || "[]"),
            createdAt: r.created_at
        }));
    },
    get(id) {
        const db = getDatabase();
        const r = db.prepare("SELECT * FROM blueprints WHERE id = ?").get(id);
        if (!r)
            return null;
        return {
            id: r.id,
            name: r.name,
            description: r.description ?? undefined,
            dimensions: { x: r.dim_x, y: r.dim_y, z: r.dim_z },
            totalBlocks: r.total_blocks,
            requiredMaterials: r.required_materials_json ? JSON.parse(r.required_materials_json) : {},
            blocks: JSON.parse(r.blocks_json || "[]"),
            createdAt: r.created_at
        };
    },
    upsert(b) {
        const db = getDatabase();
        db.prepare(`
      INSERT INTO blueprints (
        id, name, description, dim_x, dim_y, dim_z, total_blocks,
        required_materials_json, blocks_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        dim_x=excluded.dim_x,
        dim_y=excluded.dim_y,
        dim_z=excluded.dim_z,
        total_blocks=excluded.total_blocks,
        required_materials_json=excluded.required_materials_json,
        blocks_json=excluded.blocks_json
    `).run(b.id, b.name, b.description ?? null, b.dimensions.x, b.dimensions.y, b.dimensions.z, b.totalBlocks, JSON.stringify(b.requiredMaterials || {}), JSON.stringify(b.blocks || []), b.createdAt);
    },
    delete(id) {
        const db = getDatabase();
        db.prepare("DELETE FROM blueprints WHERE id = ?").run(id);
    }
};
// ======================== LANDMARKS REPOSITORY ========================
export const LandmarkRepo = {
    getAll() {
        const db = getDatabase();
        const rows = db.prepare("SELECT * FROM landmarks ORDER BY name ASC").all();
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            coordinates: { x: r.x, y: r.y, z: r.z },
            dimension: r.dimension,
            description: r.description ?? undefined,
            tags: r.tags_json ? JSON.parse(r.tags_json) : [],
            createdAt: r.created_at
        }));
    },
    upsert(l) {
        const db = getDatabase();
        db.prepare(`
      INSERT INTO landmarks (
        id, name, category, x, y, z, dimension, description, tags_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        category=excluded.category,
        x=excluded.x,
        y=excluded.y,
        z=excluded.z,
        dimension=excluded.dimension,
        description=excluded.description,
        tags_json=excluded.tags_json
    `).run(l.id, l.name, l.category, l.coordinates.x, l.coordinates.y, l.coordinates.z, l.dimension, l.description ?? null, JSON.stringify(l.tags || []), l.createdAt);
    },
    delete(id) {
        const db = getDatabase();
        db.prepare("DELETE FROM landmarks WHERE id = ?").run(id);
    }
};
// ======================== PERMISSIONS & AUDIT LOGS ========================
export const PermissionRepo = {
    getAll() {
        const db = getDatabase();
        const rows = db.prepare("SELECT * FROM player_permissions ORDER BY username ASC").all();
        return rows.map((r) => ({
            username: r.username,
            role: r.role,
            canCommandBot: Boolean(r.can_command),
            canRequestMining: Boolean(r.can_mine),
            canRequestBuilding: Boolean(r.can_build),
            canRequestStorage: Boolean(r.can_storage),
            canUseOpActions: Boolean(r.can_op),
            notes: r.notes ?? undefined,
            updatedAt: r.updated_at
        }));
    },
    get(username) {
        const db = getDatabase();
        const r = db.prepare("SELECT * FROM player_permissions WHERE LOWER(username) = LOWER(?)").get(username);
        if (!r)
            return null;
        return {
            username: r.username,
            role: r.role,
            canCommandBot: Boolean(r.can_command),
            canRequestMining: Boolean(r.can_mine),
            canRequestBuilding: Boolean(r.can_build),
            canRequestStorage: Boolean(r.can_storage),
            canUseOpActions: Boolean(r.can_op),
            notes: r.notes ?? undefined,
            updatedAt: r.updated_at
        };
    },
    upsert(p) {
        const db = getDatabase();
        db.prepare(`
      INSERT INTO player_permissions (
        username, role, can_command, can_mine, can_build, can_storage, can_op, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        role=excluded.role,
        can_command=excluded.can_command,
        can_mine=excluded.can_mine,
        can_build=excluded.can_build,
        can_storage=excluded.can_storage,
        can_op=excluded.can_op,
        notes=excluded.notes,
        updated_at=excluded.updated_at
    `).run(p.username, p.role, p.canCommandBot ? 1 : 0, p.canRequestMining ? 1 : 0, p.canRequestBuilding ? 1 : 0, p.canRequestStorage ? 1 : 0, p.canUseOpActions ? 1 : 0, p.notes ?? null, p.updatedAt);
    },
    delete(username) {
        const db = getDatabase();
        db.prepare("DELETE FROM player_permissions WHERE username = ?").run(username);
    }
};
export const AuditRepo = {
    add(log) {
        const db = getDatabase();
        db.prepare(`
      INSERT INTO audit_logs (id, timestamp, actor, action, component, severity, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(log.id, log.timestamp, log.actor, log.action, log.component, log.severity, JSON.stringify(log.details || {}));
    },
    getRecent(limit = 100) {
        const db = getDatabase();
        const rows = db.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
        return rows.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            actor: r.actor,
            action: r.action,
            component: r.component,
            severity: r.severity,
            details: r.details_json ? JSON.parse(r.details_json) : {}
        }));
    }
};
export const AppSettingsRepo = {
    get(key, defaultValue) {
        try {
            const db = getDatabase();
            const r = db.prepare("SELECT value_json FROM app_settings WHERE key = ?").get(key);
            if (!r)
                return defaultValue;
            return JSON.parse(r.value_json);
        }
        catch {
            return defaultValue;
        }
    },
    set(key, value) {
        const db = getDatabase();
        db.prepare(`
      INSERT INTO app_settings (key, value_json) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `).run(key, JSON.stringify(value));
    }
};

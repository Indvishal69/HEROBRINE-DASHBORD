import type { CapabilityRecord, CapabilityStatus } from "../types/autonomy.js";
export declare class CapabilityRegistry {
    private capabilities;
    constructor();
    register(cap: CapabilityRecord): void;
    get(id: string): CapabilityRecord | undefined;
    getAll(): CapabilityRecord[];
    getByStatus(status: CapabilityStatus): CapabilityRecord[];
    private registerDefaults;
}
export declare const capabilityRegistry: CapabilityRegistry;

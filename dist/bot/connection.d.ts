import type { Bot } from "mineflayer";
import type { BotConnectionState } from "../types/bot.js";
export interface ConnectionConfig {
    host: string;
    port: number;
    version: string;
    auth: "offline" | "microsoft";
    username: string;
}
export declare class BotConnectionService {
    private bot;
    private state;
    private lastError;
    private autoReconnectTimer;
    private autonomousLoopTimer;
    private deliberateDisconnect;
    private broadcastCallback?;
    setBroadcast(cb: (event: string, payload: unknown) => void): void;
    getBot(): Bot | null;
    getState(): BotConnectionState;
    getLastError(): string | null;
    getConfig(): ConnectionConfig;
    saveConfig(config: ConnectionConfig): void;
    connect(): Promise<void>;
    disconnect(): void;
    private cleanup;
    private scheduleReconnect;
    private startAutonomousLoop;
    private handleChat;
    private broadcastState;
}
export declare const botService: BotConnectionService;

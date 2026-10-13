import type { Bot } from "mineflayer";
export interface VisionCaptureResult {
    captured: boolean;
    timestamp: number;
    base64DataUrl?: string;
    source: string;
    disclaimer: string;
    error?: string;
}
export declare class VisionAdapter {
    private lastCaptureTime;
    private readonly MIN_INTERVAL_MS;
    captureScene(bot: Bot | null): Promise<VisionCaptureResult>;
}
export declare const visionAdapter: VisionAdapter;

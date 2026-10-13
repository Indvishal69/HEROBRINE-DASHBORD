import type { Bot } from "mineflayer";
export declare class ViewerManager {
    private activeViewer;
    private isActive;
    private port;
    constructor(port?: number);
    getViewerPort(): number;
    isViewerActive(): boolean;
    start(candidate: Bot): void;
    close(): void;
}
export declare const viewerManager: ViewerManager;

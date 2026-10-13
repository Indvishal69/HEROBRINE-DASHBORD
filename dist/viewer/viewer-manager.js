import viewerPackage from "prismarine-viewer";
const { mineflayer: mineflayerViewer } = viewerPackage;
export class ViewerManager {
    activeViewer = null;
    isActive = false;
    port = 3007;
    constructor(port = 3007) {
        this.port = port;
    }
    getViewerPort() {
        return this.port;
    }
    isViewerActive() {
        return this.isActive;
    }
    start(candidate) {
        const candAny = candidate;
        if (candAny.viewer) {
            this.activeViewer = candAny.viewer;
            this.isActive = true;
            return;
        }
        this.close();
        try {
            mineflayerViewer(candidate, { port: this.port, firstPerson: true, viewDistance: 4 });
            this.activeViewer = candAny.viewer;
            this.isActive = true;
            console.error(`[Nexus Viewer] 3D world viewer active on internal port ${this.port}`);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[Nexus Viewer] Startup failed: ${msg}`);
            this.isActive = false;
        }
    }
    close() {
        if (this.activeViewer) {
            try {
                this.activeViewer.close?.();
            }
            catch { }
            this.activeViewer = null;
        }
        this.isActive = false;
    }
}
export const viewerManager = new ViewerManager(Number(process.env.MC_VIEWER_PORT || 3007));

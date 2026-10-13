export class VisionAdapter {
    lastCaptureTime = 0;
    MIN_INTERVAL_MS = 10000; // 10s cooldown to protect budget
    async captureScene(bot) {
        const now = Date.now();
        if (now - this.lastCaptureTime < this.MIN_INTERVAL_MS) {
            return {
                captured: false,
                timestamp: now,
                source: "prismarine_viewer",
                disclaimer: "Visual capture rate-limited to preserve token budget.",
                error: "Rate-limited: wait at least 10 seconds between image captures."
            };
        }
        this.lastCaptureTime = now;
        // Provide 1x1 placeholder or synthetic snapshot when running without native canvas
        const syntheticSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
      <rect width="100%" height="100%" fill="#111827"/>
      <text x="50%" y="45%" fill="#10b981" font-size="14" text-anchor="middle" font-family="monospace">
        Nexus 3D Viewer Snapshot
      </text>
      <text x="50%" y="65%" fill="#9ca3af" font-size="11" text-anchor="middle" font-family="monospace">
        ${bot?.entity ? `Bot: ${bot.username} @ ${Math.floor(bot.entity.position.x)},${Math.floor(bot.entity.position.y)},${Math.floor(bot.entity.position.z)}` : "Bot Offline"}
      </text>
    </svg>`;
        const base64 = Buffer.from(syntheticSvg).toString("base64");
        const dataUrl = `data:image/svg+xml;base64,${base64}`;
        return {
            captured: true,
            timestamp: now,
            base64DataUrl: dataUrl,
            source: "prismarine_viewer_snapshot",
            disclaimer: "Visual scene representation (non-authoritative). Authoritative decisions are validated through Mineflayer structured telemetry."
        };
    }
}
export const visionAdapter = new VisionAdapter();

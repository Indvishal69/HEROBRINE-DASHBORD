$ErrorActionPreference = "Stop"
$url = "http://127.0.0.1:3080"
try {
    Invoke-WebRequest -Uri "$url/api/state" -TimeoutSec 2 | Out-Null
} catch {
    throw "Minecraft AI Buddy is not running yet. Open or restart Codex or Antigravity with the minecraft-ai-buddy MCP server enabled, then try again."
}
Start-Process $url

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

Write-Host "Minecraft AI Buddy setup (Java Edition)" -ForegroundColor Cyan
Write-Host "This installs the free local dashboard and registers its Minecraft controls with Codex and Antigravity."
Write-Host "You can enter or change the server IP and port later in the dashboard."
Write-Host ""

$serverEntry = Join-Path $projectRoot "src\index.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 or newer is required. Install it from https://nodejs.org/ and run setup.ps1 again."
}
$nodeVersionText = (& node --version).Trim()
$nodeMajor = [int]($nodeVersionText.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
    throw "Node.js 22 or newer is required; this computer has $nodeVersionText. Install a newer version and run setup.ps1 again."
}

$requiredPackages = @(
    "@modelcontextprotocol\sdk",
    "canvas",
    "dotenv",
    "express",
    "mineflayer",
    "mineflayer-pathfinder",
    "prismarine-viewer",
    "socket.io",
    "vec3",
    "zod"
)
$missingPackages = @($requiredPackages | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $projectRoot ("node_modules\" + $_ + "\package.json")))
})

if ($missingPackages.Count -gt 0) {
    $runningBuddy = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$serverEntry*" }
    if ($runningBuddy) {
        throw "Some packages are missing while Minecraft AI Buddy is running. Fully quit Codex to release its package files, then run setup.ps1 again."
    }

    Push-Location $projectRoot
    try {
        Write-Host "Installing the bot, live POV, and dashboard packages..." -ForegroundColor Cyan
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "Package installation did not complete successfully." }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "All required packages are already installed; skipping npm ci so a running Codex server keeps working." -ForegroundColor Green
}

$codexCommand = Get-Command codex -ErrorAction SilentlyContinue
if ($codexCommand) {
    $registeredServers = (& $codexCommand.Source mcp list 2>$null | Out-String)
    $listExitCode = $LASTEXITCODE
    if ($listExitCode -eq 0 -and $registeredServers -match "(?m)^minecraft-buddy\s") {
        Write-Host "Minecraft AI Buddy is already registered with Codex." -ForegroundColor Green
    } else {
        Write-Host "Registering Minecraft AI Buddy with Codex..." -ForegroundColor Cyan
        & $codexCommand.Source mcp add minecraft-buddy -- node $serverEntry
        if ($LASTEXITCODE -ne 0) {
            throw "Codex could not register the MCP server. Follow the manual setup in README.md. The packages are ready."
        }
    }
    Write-Host "Codex registration is ready. Restart the AI host you plan to use so its local dashboard starts." -ForegroundColor Green
} else {
    Write-Host "Codex CLI was not found, so Codex registration was skipped. Antigravity can still use this server; see README.md." -ForegroundColor Yellow
}

$antigravityConfig = Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json"
$antigravityDirectory = Split-Path -Parent $antigravityConfig
if (-not (Test-Path -LiteralPath $antigravityDirectory)) {
    New-Item -ItemType Directory -Path $antigravityDirectory -Force | Out-Null
}

if (Test-Path -LiteralPath $antigravityConfig) {
    try {
        $antigravityRoot = Get-Content -LiteralPath $antigravityConfig -Raw | ConvertFrom-Json
        if ($null -eq $antigravityRoot) { throw "The config file is empty." }
    } catch {
        throw "Antigravity's MCP config is not valid JSON, so setup left it untouched: $antigravityConfig. Fix the JSON and run setup.ps1 again."
    }
} else {
    $antigravityRoot = [pscustomobject]@{}
}

$serversProperty = $antigravityRoot.PSObject.Properties["mcpServers"]
if ($null -eq $serversProperty -or $null -eq $serversProperty.Value) {
    $antigravityRoot | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([pscustomobject]@{}) -Force
    $antigravityServers = $antigravityRoot.mcpServers
} else {
    $antigravityServers = $serversProperty.Value
}
if ($antigravityServers -isnot [pscustomobject]) {
    throw "Antigravity's 'mcpServers' entry must be a JSON object. Setup left it untouched: $antigravityConfig"
}

$botServer = [pscustomobject]@{ command = "node"; args = @($serverEntry); cwd = $projectRoot }
$antigravityServers | Add-Member -MemberType NoteProperty -Name "minecraft-ai-buddy" -Value $botServer -Force
$configJson = $antigravityRoot | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($antigravityConfig, $configJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Host "Minecraft AI Buddy is registered with Antigravity at $antigravityConfig" -ForegroundColor Green

Write-Host "Restart Codex or Antigravity after setup, then run .\open-gui.ps1 to open the dashboard."
Write-Host "Use only one AI host at a time; each host starts its own bot and local dashboard ports."

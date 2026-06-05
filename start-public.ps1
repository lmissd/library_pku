param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalUrl = "http://127.0.0.1:$Port"

Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Please install Node.js 18 or newer."
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw "cloudflared is required. Install Cloudflare Tunnel first, then run this script again."
}

$ConfigPath = Join-Path $Root "config.local.json"
if (-not (Test-Path $ConfigPath)) {
  Write-Host "config.local.json was not found. Copy config.local.example.json first and fill in cozeToken." -ForegroundColor Yellow
} else {
  $configText = Get-Content -Path $ConfigPath -Raw
  if ($configText -match "YOUR_TOKEN_HERE") {
    Write-Host "config.local.json still contains YOUR_TOKEN_HERE. Please fill in the real Coze token before testing with children." -ForegroundColor Yellow
  }
}

$existing = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($existing) {
  Write-Host "Port $Port is already in use. Reusing $LocalUrl for the tunnel." -ForegroundColor Yellow
  $serverProcess = $null
} else {
  Write-Host "Starting local H5 collector on $LocalUrl ..." -ForegroundColor Cyan
  $env:PORT = [string]$Port
  $serverProcess = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $Root -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

try {
  Invoke-WebRequest -UseBasicParsing $LocalUrl -TimeoutSec 10 | Out-Null

  Write-Host ""
  Write-Host "Public tunnel is starting." -ForegroundColor Green
  Write-Host "Copy the https://*.trycloudflare.com link shown below and open it on any phone." -ForegroundColor Green
  Write-Host "Keep this window open while children are using the page." -ForegroundColor Yellow
  Write-Host ""

  cloudflared tunnel --url $LocalUrl
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }
  Remove-Item Env:\PORT -ErrorAction SilentlyContinue
}

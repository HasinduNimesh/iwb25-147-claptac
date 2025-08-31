# Start all services for EcoMeter (Windows PowerShell)
# - Starts Docker dependencies (Fuseki, MQTT)
# - Starts all Ballerina services (multiple windows)
# - Starts the React webapp (Vite dev server)

$ErrorActionPreference = 'Stop'

Write-Host "[1/3] Starting Docker dependencies (Fuseki, MQTT)..." -ForegroundColor Cyan
pushd "$PSScriptRoot\deploy"
docker compose up -d fuseki mqtt
popd

Write-Host "[2/3] Starting Ballerina services..." -ForegroundColor Cyan
$ballerinaDir = Join-Path $PSScriptRoot 'ballerina'
# Run the entire package (this starts all listeners/services in the package)
Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$ballerinaDir`"; bal run" | Out-Null

Write-Host "[3/3] Starting Webapp (Vite dev server on http://localhost:5173)..." -ForegroundColor Cyan
$webappDir = Join-Path $PSScriptRoot 'webapp'
Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$webappDir`"; if (Test-Path node_modules) { npm run dev } else { npm install; npm run dev }" | Out-Null

Write-Host "\nServices launching. Give them ~5-10 seconds, then run these checks:" -ForegroundColor Green
Write-Host " - Auth:     Invoke-WebRequest http://localhost:8087/auth/health | % Content"
Write-Host " - GraphQL:  Invoke-WebRequest http://localhost:9091/healthz | % Content  (expect: ok)"
Write-Host " - UI GW:    Invoke-WebRequest http://localhost:9080/ | % StatusCode      (expect: 200)"
Write-Host " - Webapp:   Open http://localhost:5173 in your browser"

<#
Reset LankaWatteWise demo data: Fuseki dataset + in-memory app state
Usage:
  powershell -ExecutionPolicy Bypass -File .\scripts\reset-data.ps1 -UserId demo
#>
# Requirements: Fuseki at http://localhost:3030 (docker compose up -d fuseki)
# Run from repo root or this folder: powershell -ExecutionPolicy Bypass -File .\scripts\reset-data.ps1

param([string]$UserId = 'demo')
$ErrorActionPreference = 'Stop'

function Invoke-Http {
  param(
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Url,
    [string]$Body,
    [hashtable]$Headers
  )
  try {
    if ($Body) {
      Invoke-RestMethod -Method $Method -Uri $Url -Body $Body -Headers $Headers -UseBasicParsing
    } else {
      Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -UseBasicParsing
    }
  } catch {
    Write-Warning $_.Exception.Message
  }
}

function Set-ConfigValue {
  param(
    [Parameter(Mandatory=$true)][string]$Endpoint, # e.g., 'tariff', 'appliances'
    [Parameter(Mandatory=$true)][string]$UserId,
    [Parameter(Mandatory=$true)][string]$JsonBody
  )
  $encodedUser = [uri]::EscapeDataString($UserId)
  $candidates = @(
    "http://localhost:8090/config/${Endpoint}?userId=$encodedUser",
    "http://localhost:9080/config/${Endpoint}?userId=$encodedUser"
  )
  foreach ($u in $candidates) {
    try {
      Invoke-RestMethod -Method POST -Uri $u -Body $JsonBody -Headers @{ 'Content-Type'='application/json' } -UseBasicParsing | Out-Null
  Write-Host "  OK POST $Endpoint -> $u" -ForegroundColor DarkGreen
      return $true
    } catch {
  Write-Host "  WARN POST $Endpoint failed at $u" -ForegroundColor DarkYellow
    }
  }
  return $false
}

Write-Host '--- LankaWatteWise reset starting ---' -ForegroundColor Cyan

# 1) Reset Fuseki dataset `lww`
$admin = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('admin:admin'))
$auth = @{ Authorization = "Basic $admin" }
$base = 'http://localhost:3030'

Write-Host 'Deleting dataset lww (if exists)...'
Invoke-Http -Method DELETE -Url "$base/$/datasets/lww" -Headers $auth | Out-Null
Start-Sleep -Milliseconds 500

Write-Host 'Creating dataset lww...'
Invoke-Http -Method POST -Url "$base/$/datasets" -Body 'dbName=lww&dbType=mem' -Headers (@{ 'Content-Type'='application/x-www-form-urlencoded'; Authorization = "Basic $admin" }) | Out-Null

# 2) Load ontology seed
$seedPath = Join-Path $PSScriptRoot '..\ontology\seed.ttl'
if (Test-Path $seedPath) {
  Write-Host 'Loading ontology seed.ttl into /lww/data...'
  $ttl = Get-Content -Path $seedPath -Raw
  Invoke-Http -Method POST -Url "$base/lww/data" -Body $ttl -Headers (@{ 'Content-Type'='text/turtle'; Authorization = "Basic $admin" }) | Out-Null
} else {
  Write-Warning "Seed file not found: $seedPath"
}

# 3) Clear app in-memory configs via gateway endpoints for the given user (best-effort)
$gw = 'http://localhost:9080'
Write-Host "Clearing user config for '$UserId' (tariff, appliances, tasks, co2, solar)..."
# Set a sensible default TOU tariff with windows
$defaultTariff = @{
  utility = 'CEB'; tariffType = 'TOU'; windows = @(
    @{ name='Off-Peak'; startTime='22:30'; endTime='05:30'; rateLKR=25.0 },
    @{ name='Day';      startTime='05:30'; endTime='18:30'; rateLKR=45.0 },
    @{ name='Peak';     startTime='18:30'; endTime='22:30'; rateLKR=70.0 }
  )
} | ConvertTo-Json -Depth 4
Set-ConfigValue -Endpoint 'tariff' -UserId $UserId -JsonBody $defaultTariff | Out-Null
Set-ConfigValue -Endpoint 'appliances' -UserId $UserId -JsonBody '[]' | Out-Null
Set-ConfigValue -Endpoint 'tasks' -UserId $UserId -JsonBody '[]' | Out-Null
Set-ConfigValue -Endpoint 'co2' -UserId $UserId -JsonBody '{}' | Out-Null
Set-ConfigValue -Endpoint 'solar' -UserId $UserId -JsonBody '{}' | Out-Null

Write-Host '--- LankaWatteWise reset complete ---' -ForegroundColor Green

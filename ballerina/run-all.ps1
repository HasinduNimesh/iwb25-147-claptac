# Starts all top-level Ballerina services in separate PowerShell windows

$files = @(
    "api_gateway.bal",
    "advice_engine.bal",
    "tariff_context.bal",
    "ontology_proxy.bal",
    "notifications.bal",
    "iot_ingest.bal",
    "ui_gateway.bal",
    "config_service.bal",
    "billing_service.bal",
    "scheduler_service.bal"
)

foreach ($f in $files) {
    $path = Join-Path $PSScriptRoot $f
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$PSScriptRoot`"; bal run `"$path`"" | Out-Null
}

Write-Host "Launched Ballerina services in separate terminals."

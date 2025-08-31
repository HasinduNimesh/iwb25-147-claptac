param(
    [switch]$Background
)

# Start the entire Ballerina package (all services/listeners) in a single process
# Prevent spawning many PowerShell windows; optional -Background to run detached

$cmd = "cd `"$PSScriptRoot`"; bal run"
if ($Background) {
    Start-Process powershell -ArgumentList "-NoExit","-Command",$cmd | Out-Null
    Write-Host "Started Ballerina package in a new terminal."
} else {
    Invoke-Expression $cmd
}

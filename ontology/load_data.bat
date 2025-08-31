@echo off
echo Loading ontology data into Fuseki...

REM Create the dataset first with authentication
powershell -Command "try { $body = 'dbName=lww&dbType=mem'; $headers = @{'Content-Type'='application/x-www-form-urlencoded'}; $cred = [System.Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes('admin:admin')); $headers['Authorization'] = 'Basic ' + $cred; Invoke-RestMethod -Uri 'http://localhost:3030/$/datasets' -Method POST -Body $body -Headers $headers; Write-Host 'Dataset created successfully' } catch { Write-Host 'Dataset creation failed: ' $_.Exception.Message }"

REM Wait a moment
timeout /t 2 /nobreak

REM Load the TTL data with authentication
powershell -Command "try { $ttlContent = Get-Content -Path 'seed.ttl' -Raw; $headers = @{'Content-Type'='text/turtle'}; $cred = [System.Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes('admin:admin')); $headers['Authorization'] = 'Basic ' + $cred; Invoke-RestMethod -Uri 'http://localhost:3030/lww/data' -Method POST -Body $ttlContent -Headers $headers; Write-Host 'Data loaded successfully' } catch { Write-Host 'Data loading failed: ' $_.Exception.Message }"

echo Done!
pause

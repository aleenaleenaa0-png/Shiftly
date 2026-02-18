# Script to create the default manager user in the database
Write-Host "Creating default manager user..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "http://localhost:5224/api/account/create-manager" -Method POST -ContentType "application/json" -UseBasicParsing
    
    if ($response.StatusCode -eq 200) {
        $result = $response.Content | ConvertFrom-Json
        Write-Host "✓ Success!" -ForegroundColor Green
        Write-Host "  Message: $($result.message)" -ForegroundColor White
        if ($result.user) {
            Write-Host "  Manager Details:" -ForegroundColor Yellow
            Write-Host "    Email: $($result.user.email)" -ForegroundColor White
            Write-Host "    Password: $($result.user.password)" -ForegroundColor White
            Write-Host "    User ID: $($result.user.userId)" -ForegroundColor White
        }
    } else {
        Write-Host "✗ Failed with status: $($response.StatusCode)" -ForegroundColor Red
        Write-Host $response.Content -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
    Write-Host "Make sure the backend is running on http://localhost:5224" -ForegroundColor Yellow
}


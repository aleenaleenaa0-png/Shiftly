# Simple script to seed stores in Shiftly database
# Make sure the backend is running on http://localhost:5224

Write-Host "Seeding stores..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "http://localhost:5224/api/stores/seed" -Method POST -ContentType "application/json" -ErrorAction Stop
    $result = $response.Content | ConvertFrom-Json
    Write-Host "Success: $($result.message)" -ForegroundColor Green
    if ($result.stores) {
        Write-Host "Created stores:" -ForegroundColor Yellow
        $result.stores | ForEach-Object { Write-Host "  - $($_.Name) ($($_.Location))" -ForegroundColor White }
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    Write-Host "`nMake sure:" -ForegroundColor Yellow
    Write-Host "  1. Backend is running (cd Backend\Backend\Backend && dotnet run)" -ForegroundColor White
    Write-Host "  2. Database file exists at Backend\DB\ShiftlyDB.accdb" -ForegroundColor White
    Write-Host "  3. Microsoft Access is closed (it locks the database)" -ForegroundColor White
}


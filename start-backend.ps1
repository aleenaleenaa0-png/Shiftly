# PowerShell script to start the backend server
Write-Host "Starting Shiftly Backend Server..." -ForegroundColor Cyan
Write-Host "Backend will run on http://localhost:5224" -ForegroundColor Yellow
Write-Host ""

cd Backend\Backend\Backend
dotnet run


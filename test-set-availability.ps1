# Manual test: call set-availability 6 times (slots 1-6) and verify 6 rows.
# 1. Start the Backend (e.g. from Visual Studio or: dotnet run --project Backend\Backend\Backend)
# 2. Set $EmployeeId below to a real employee ID from your database
# 3. Run: .\test-set-availability.ps1

# Backend API URL (NOT port 3000 - that is the frontend). From launchSettings.json: backend is on 5224.
$BaseUrl = "http://localhost:5224"
$EmployeeId = 1   # Replace with a real EmployeeId from your DB

$endpoint = "$BaseUrl/api/availabilities/set-availability"

Write-Host "Testing set-availability: 6 requests (slots 1-6, isAvailable=true)"
Write-Host "Backend: $endpoint"
Write-Host "EmployeeId: 1"
Write-Host ""

# Skip SSL cert check for local dev
if ($BaseUrl -match "https://") {
    add-type @"
    using System.Net; using System.Security.Cryptography.X509Certificates;
    public class TrustAllCertsPolicy : ICertificatePolicy { public bool CheckValidationResult(object a, X509Certificate b, X509Chain c, System.Net.Security.SslPolicyErrors d) { return true; } }
"@
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
}

$created = 0
$updated = 0
foreach ($slot in 1..6) {
    $body = @{ employeeId = $EmployeeId; slotNumber = $slot; isAvailable = $true } | ConvertTo-Json
    try {
        $resp = Invoke-WebRequest -Uri $endpoint -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
        $obj = $resp.Content | ConvertFrom-Json
        if ($obj.updated) { $updated++ } else { $created++ }
        Write-Host "  Slot $slot -> AvailabilityId=$($obj.availabilityId), updated=$($obj.updated)"
    } catch {
        Write-Host "  Slot $slot -> ERROR: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $bodyText = $reader.ReadToEnd()
            if ($bodyText) { Write-Host "       API body: $bodyText" }
        }
    }
}

Write-Host ""
Write-Host "Done. Created: $created, Updated: $updated"
Write-Host "Check the Availabilities table in Access: you should see $($created + $updated) rows for this employee (one per slot 1-6)."
Write-Host "Also check the Backend console for [SetEmployeeAvailability] logs (SlotNumber and ShiftId per request)."

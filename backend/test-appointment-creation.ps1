# Test appointment creation with fixed code

$baseUrl = "http://localhost:5001"

# Test 1: Get a provider ID
Write-Host "Step 1: Fetching providers..."
try {
    $providersResponse = Invoke-WebRequest -Uri "$baseUrl/api/providers" -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
    if ($providersResponse -and $providersResponse.data -and $providersResponse.data[0]) {
        $providerId = $providersResponse.data[0]._id
        $providerName = $providersResponse.data[0].name
        Write-Host "✓ Found provider: $providerName (ID: $providerId)"
    } else {
        Write-Host "✗ No providers found"
        exit 1
    }
} catch {
    Write-Host "✗ Error fetching providers: $($_.Exception.Message)"
    exit 1
}

# Test 2: Create an appointment
Write-Host "`nStep 2: Creating appointment..."
$scheduledStart = (Get-Date).AddHours(24).ToUniversalTime().ToString("o")
$appointmentData = @{
    providerId = $providerId
    serviceCode = "SERVICE001"
    scheduledStart = $scheduledStart
    customerName = "Test Customer"
    customerEmail = "test@example.com"
    customerPhone = "1234567890"
    bookingType = "in_person"
} | ConvertTo-Json

try {
    $appointmentResponse = Invoke-WebRequest `
        -Uri "$baseUrl/api/appointments" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $appointmentData `
        -UseBasicParsing `
        -TimeoutSec 15
    
    if ($appointmentResponse.StatusCode -eq 201) {
        $appointment = $appointmentResponse.Content | ConvertFrom-Json
        Write-Host "✓ Appointment created successfully!"
        Write-Host "  Appointment ID: $($appointment.appointment._id)"
        Write-Host "  Status: $($appointment.appointment.status)"
        Write-Host "  Customer: $($appointment.appointment.customerName)"
        Write-Host "`n✅ TEST PASSED - 400 Error is FIXED!"
    } else {
        Write-Host "✗ Unexpected status code: $($appointmentResponse.StatusCode)"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    $errorBody = $_.Exception.Response.Content.ToString()
    
    if ($statusCode -eq 400) {
        Write-Host "✗ Got 400 error (BUG NOT FIXED):"
        Write-Host "  $errorBody"
    } else {
        Write-Host "✗ Error: Status $statusCode"
        Write-Host "  $errorBody"
    }
}

Write-Host "`n=== Test Complete ==="

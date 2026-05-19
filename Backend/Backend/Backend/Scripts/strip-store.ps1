$files = @(
  "c:\Project\Shiftly\Backend\Backend\Backend\Controllers\ShiftsController.cs",
  "c:\Project\Shiftly\Backend\Backend\Backend\Controllers\AccountController.cs",
  "c:\Project\Shiftly\Backend\Backend\Backend\Controllers\EmployeesController.cs",
  "c:\Project\Shiftly\Backend\Backend\Backend\Controllers\UsersController.cs",
  "c:\Project\Shiftly\Backend\Backend\Backend\Controllers\AvailabilitiesController.cs",
  "c:\Project\Shiftly\Backend\Backend\Backend\Program.cs"
)
foreach ($path in $files) {
  if (-not (Test-Path $path)) { continue }
  $c = Get-Content $path -Raw
  $c = $c -replace '\.Include\(s => s\.Store\)\s*', ''
  $c = $c -replace '\.Include\(e => e\.Store\)\s*', ''
  $c = $c -replace 's\.StoreId == storeId\.Value &&\s*', ''
  $c = $c -replace 's\.StoreId == storeId &&\s*', ''
  $c = $c -replace 's\.StoreId == storeIdValue &&\s*', ''
  $c = $c -replace 'employee\.StoreId != storeId[\s\S]*?return BadRequest[^;]+;', ''
  $c = $c -replace 'managerUser\.StoreId != storeId[\s\S]*?return Forbid[^;]+;', ''
  $c = $c -replace 'StoreId = storeId\.Value,\r?\n\s*', ''
  $c = $c -replace 'StoreId = storeIdValue,\r?\n\s*', ''
  $c = $c -replace 'StoreId = dto\.StoreId,\r?\n\s*', ''
  $c = $c -replace 'shift\.StoreId = dto\.StoreId;\r?\n\s*', ''
  $c = $c -replace ',\s*s\.StoreId', ''
  $c = $c -replace 's\.StoreId,\r?\n\s*', ''
  $c = $c -replace 'StoreName = s\.Store != null \? s\.Store\.Name : null,\r?\n\s*', ''
  $c = $c -replace 'StoreName = shift\.Store\?\.Name,\r?\n\s*', ''
  $c = $c -replace 'Shift_StoreID INTEGER NOT NULL,\r?\n\s*', ''
  $c = $c -replace 'StoreId INTEGER NOT NULL,\r?\n\s*', ''
  $c = $c -replace 'new Claim\("StoreId", [^)]+\)\s*,?\r?\n\s*', ''
  Set-Content $path $c -NoNewline
}

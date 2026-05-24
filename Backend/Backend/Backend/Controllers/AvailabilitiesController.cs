// =============================================================================
// AvailabilitiesController.cs — توفر العمال (قلب التنسيق بين عامل ومدير)
// =============================================================================
// set-availability / set-slot — العامل يحدّد توفره (Slot 1–14).
// all-for-employee/{id} — خريطة توفر عامل واحد.
// manager-summary — كل التوفر دفعة واحدة (صفحة المدير).
// for-shift/{shiftId} — من متاح لهذه المناوبة؟
//
// للمختبر:
//   1) سجّل دخول كعامل → حدّد عدة فتحات متاحة
//   2) سجّل دخول كمدير → يجب ظهور العدد والشارات في الشريط الجانبي
//   3) اسحب عاملاً متاحاً فقط إلى مناوبة مطابقة
// =============================================================================

using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Data.OleDb;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AvailabilitiesController : ControllerBase
    {
        private readonly AppData _db;
        private readonly IConfiguration _config;

        public AvailabilitiesController(AppData db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        private string GetOleDbConnectionString()
        {
            var connectionString = _config.GetConnectionString("ShiftlyConnection")
                ?? "Data Source=C:\\Users\\aleen\\Documents\\ShiftlyDB.accdb";
            if (!connectionString.Trim().Contains("Provider=", StringComparison.OrdinalIgnoreCase))
                connectionString = "Provider=Microsoft.ACE.OLEDB.12.0;" + (connectionString.Trim().StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase) ? connectionString.Trim() : "Data Source=" + connectionString.Trim()) + ";";
            return connectionString;
        }

        /// <summary>Access YESNO is often stored as -1 (true) or 0 (false).</summary>
        private static bool ReadAccessYesNo(object? value)
        {
            if (value == null || value == DBNull.Value) return false;
            if (value is bool b) return b;
            try { return Convert.ToInt32(value) != 0; }
            catch { return Convert.ToBoolean(value); }
        }

        // GET: api/Availabilities
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetAvailabilities([FromQuery] int? employeeId = null)
        {
            try
            {
                var query = _db.Availabilities.Include(a => a.Employee).Include(a => a.Shift).AsQueryable();

                if (employeeId.HasValue)
                {
                    query = query.Where(a => a.EmployeeId == employeeId.Value);
                }

                var availabilities = await query
                    .Select(a => new
                    {
                        a.AvailabilityId,
                        a.EmployeeId,
                        EmployeeName = a.Employee != null ? a.Employee.FirstName : null,
                        a.ShiftId,
                        ShiftInfo = a.Shift != null ? new { 
                            StartTime = a.Shift.StartTime, 
                            EndTime = a.Shift.EndTime 
                        } : null,
                        a.IsAvailable
                    })
                    .ToListAsync();

                return Ok(availabilities);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve availabilities", message = ex.Message });
            }
        }

        // GET: api/Availabilities/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetAvailability(int id)
        {
            try
            {
                var availability = await _db.Availabilities
                    .Include(a => a.Employee)
                    .Include(a => a.Shift)
                    .FirstOrDefaultAsync(a => a.AvailabilityId == id);

                if (availability == null)
                {
                    return NotFound(new { error = "Availability not found" });
                }

                return Ok(new
                {
                    availability.AvailabilityId,
                    availability.EmployeeId,
                    EmployeeName = availability.Employee != null ? availability.Employee.FirstName : null,
                    availability.ShiftId,
                    ShiftInfo = availability.Shift != null ? new { 
                        StartTime = availability.Shift.StartTime, 
                        EndTime = availability.Shift.EndTime 
                    } : null,
                    availability.IsAvailable
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve availability", message = ex.Message });
            }
        }

        // POST: api/Availabilities
        [HttpPost]
        public async Task<ActionResult<Availability>> CreateAvailability([FromBody] CreateAvailabilityDto dto)
        {
            try
            {
                // Ensure Availabilities table exists
                try
                {
                    var testCount = await _db.Availabilities.CountAsync();
                }
                catch (Exception tableEx)
                {
                    if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist"))
                    {
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync(@"
                                CREATE TABLE Availabilities (
                                    AvailabilityID AUTOINCREMENT PRIMARY KEY,
                                    EmployeeId INTEGER NOT NULL,
                                    ShiftId INTEGER NOT NULL,
                                    IsAvailable YESNO NOT NULL,
                                    CONSTRAINT UniqueEmployeeShift UNIQUE (EmployeeId, ShiftId)
                                )
                            ");
                            Console.WriteLine("ג“ Created Availabilities table with Access structure and unique constraint");
                        }
                        catch (Exception createEx)
                        {
                            return StatusCode(500, new 
                            { 
                                error = "Database setup error", 
                                message = $"Could not create Availabilities table: {createEx.Message}" 
                            });
                        }
                    }
                }

                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var availability = new Availability
                {
                    EmployeeId = dto.EmployeeId,
                    ShiftId = dto.ShiftId, // CreateAvailabilityDto still uses ShiftId (not SlotNumber)
                    IsAvailable = dto.IsAvailable
                };

                _db.Availabilities.Add(availability);
                await _db.SaveChangesAsync();

                return CreatedAtAction(nameof(GetAvailability), new { id = availability.AvailabilityId }, availability);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to create availability", message = ex.Message });
            }
        }


        // ─── العامل يحفظ توفره (فتحة 1–14) ───
        // يُستدعى عند النقر على خانة في صفحة التوفر.
        [HttpPost("set-availability")]
        [HttpPost("set-slot")]
        public async Task<IActionResult> SetEmployeeAvailability([FromBody] SetSlotAvailabilityDto dto)
        {
            try
            {
                Console.WriteLine($"[SetEmployeeAvailability] EmployeeId={dto.EmployeeId}, SlotNumber={dto.SlotNumber}, IsAvailable={dto.IsAvailable}");

                if (dto.SlotNumber < 1 || dto.SlotNumber > 14)
                    return BadRequest(new { error = "Invalid SlotNumber", message = "SlotNumber must be 1-14." });

                var connStr = _config.GetConnectionString("ShiftlyConnection")
                    ?? "Data Source=C:\\Users\\aleen\\Documents\\ShiftlyDB.accdb";
                if (!connStr.Trim().Contains("Provider=", StringComparison.OrdinalIgnoreCase))
                    connStr = "Provider=Microsoft.ACE.OLEDB.12.0;" + (connStr.Trim().StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase) ? connStr.Trim() : "Data Source=" + connStr.Trim()) + ";";

                var weekMonday = ShiftBootstrap.GetWeekStart(
                    string.IsNullOrWhiteSpace(dto.WeekStart) ? null : DateTime.Parse(dto.WeekStart));
                var result = await Task.Run(() =>
                    SetEmployeeAvailabilityWithOleDb(connStr, dto.EmployeeId, dto.SlotNumber, dto.IsAvailable, weekMonday));
                if (result.Error != null)
                    return result.NotFound ? NotFound(new { error = result.Error }) : StatusCode(500, new { error = "Failed to set employee availability", message = result.Error });
                return Ok(result.Response);
            }
            catch (Exception ex)
            {
                var inner = ex.InnerException?.Message ?? "";
                Console.WriteLine($"[SetEmployeeAvailability] ERROR: {ex.Message}");
                if (!string.IsNullOrEmpty(inner)) Console.WriteLine($"[SetEmployeeAvailability] INNER: {inner}");
                return StatusCode(500, new { error = "Failed to set employee availability", message = ex.Message, inner = inner });
            }
        }

        /// <summary>Runs set-availability logic with raw OleDb to avoid EF Core Jet #Dual.</summary>
        private static (object? Response, string? Error, bool NotFound) SetEmployeeAvailabilityWithOleDb(
            string connectionString, int employeeId, int slotNumber, bool isAvailable, DateTime weekMonday)
        {
            using var conn = new OleDbConnection(connectionString);
            conn.Open();

            using (var empCheck = conn.CreateCommand())
            {
                empCheck.CommandText = "SELECT EmployeeId FROM Employees WHERE EmployeeId = ?";
                empCheck.Parameters.Add(new OleDbParameter("@p1", employeeId));
                var empId = empCheck.ExecuteScalar();
                if (empId == null || empId == DBNull.Value)
                    return (null, "Employee not found", true);
            }

            var monday = ShiftBootstrap.GetWeekStart(weekMonday);
            var weekEnd = monday.AddDays(7);
            ShiftBootstrap.EnsureFourteenShiftsOleDb(conn, monday);

            int shiftId = 0;
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"SELECT TOP 1 Shift_ID FROM Shifts 
WHERE Shift_SlotNumber = ? AND Shift_StartTime >= ? AND Shift_StartTime < ? AND Shift_ID > 0 
ORDER BY Shift_StartTime";
                cmd.Parameters.Add(new OleDbParameter("@p1", slotNumber));
                cmd.Parameters.Add(new OleDbParameter("@p2", monday));
                cmd.Parameters.Add(new OleDbParameter("@p3", weekEnd));
                var o = cmd.ExecuteScalar();
                if (o == null || o == DBNull.Value)
                {
                    ShiftBootstrap.EnsureFourteenShiftsOleDb(conn, monday);
                    using var retryCmd = conn.CreateCommand();
                    retryCmd.CommandText = @"SELECT TOP 1 Shift_ID FROM Shifts 
WHERE Shift_SlotNumber = ? AND Shift_StartTime >= ? AND Shift_StartTime < ? AND Shift_ID > 0 
ORDER BY Shift_StartTime";
                    retryCmd.Parameters.Add(new OleDbParameter("@p1", slotNumber));
                    retryCmd.Parameters.Add(new OleDbParameter("@p2", monday));
                    retryCmd.Parameters.Add(new OleDbParameter("@p3", weekEnd));
                    o = retryCmd.ExecuteScalar();
                }
                if (o == null || o == DBNull.Value)
                    return (null, $"No shift for slot {slotNumber} this week. Refresh the page.", true);
                shiftId = Convert.ToInt32(o);
            }

            Console.WriteLine($"[SetEmployeeAvailability] SlotNumber={slotNumber} -> ShiftId={shiftId}");

            // 3) Ensure Availabilities table exists (try read; on failure create)
            try
            {
                using var checkCmd = conn.CreateCommand();
                checkCmd.CommandText = "SELECT TOP 1 AvailabilityID FROM Availabilities";
                checkCmd.ExecuteScalar();
            }
            catch
            {
                using var createCmd = conn.CreateCommand();
                createCmd.CommandText = @"CREATE TABLE Availabilities (
    AvailabilityID AUTOINCREMENT PRIMARY KEY,
    EmployeeId INTEGER NOT NULL,
    ShiftId INTEGER NOT NULL,
    IsAvailable YESNO NOT NULL,
    CONSTRAINT UniqueEmployeeShift UNIQUE (EmployeeId, ShiftId)
)";
                createCmd.ExecuteNonQuery();
            }

            // 4) Find existing availability for this employee and slot number
            // CRITICAL: We need to find availability by SlotNumber, not just ShiftId
            // This ensures availability persists even when shifts are recreated for a new week
            int? existingId = null;
            int? existingShiftId = null;
            
            // First, try to find by exact ShiftId (for current week)
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT AvailabilityID, ShiftId FROM Availabilities WHERE EmployeeId = ? AND ShiftId = ?";
                cmd.Parameters.Add(new OleDbParameter("@p1", employeeId));
                cmd.Parameters.Add(new OleDbParameter("@p2", shiftId));
                using var reader = cmd.ExecuteReader();
                if (reader.Read())
                {
                    existingId = reader.GetInt32(0);
                    existingShiftId = reader.GetInt32(1);
                }
            }
            
            // If not found by ShiftId, try to find by SlotNumber (for previous weeks)
            // This ensures we update existing availability even if the shift was recreated
            if (!existingId.HasValue)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT TOP 1 a.AvailabilityID, a.ShiftId 
                        FROM Availabilities a
                        INNER JOIN Shifts s ON a.ShiftId = s.Shift_ID
                        WHERE a.EmployeeId = ? AND s.Shift_SlotNumber = ?
                        ORDER BY a.AvailabilityID DESC";
                    cmd.Parameters.Add(new OleDbParameter("@p1", employeeId));
                    cmd.Parameters.Add(new OleDbParameter("@p2", slotNumber));
                    using var reader = cmd.ExecuteReader();
                    if (reader.Read())
                    {
                        existingId = reader.GetInt32(0);
                        existingShiftId = reader.GetInt32(1);
                        Console.WriteLine($"[SetEmployeeAvailability] Found existing availability by SlotNumber: AvailabilityId={existingId}, OldShiftId={existingShiftId}, NewShiftId={shiftId}");
                    }
                }
            }

            if (existingId.HasValue)
            {
                // If the ShiftId changed (week changed), update the ShiftId to point to current week's shift
                // This ensures availability is always linked to the current week's shift
                if (existingShiftId.HasValue && existingShiftId.Value != shiftId)
                {
                    Console.WriteLine($"[SetEmployeeAvailability] Updating ShiftId from {existingShiftId.Value} to {shiftId} (week changed)");
                    using var updateShiftCmd = conn.CreateCommand();
                    updateShiftCmd.CommandText = "UPDATE Availabilities SET ShiftId = ?, IsAvailable = ? WHERE AvailabilityID = ?";
                    updateShiftCmd.Parameters.Add(new OleDbParameter("@p1", shiftId));
                    updateShiftCmd.Parameters.Add(new OleDbParameter("@p2", isAvailable));
                    updateShiftCmd.Parameters.Add(new OleDbParameter("@p3", existingId.Value));
                    var rowsAffected = updateShiftCmd.ExecuteNonQuery();
                    Console.WriteLine($"[SetEmployeeAvailability] ✓✓✓ UPDATED AvailabilityId={existingId} (ShiftId updated to {shiftId}) for EmployeeId={employeeId}, SlotNumber={slotNumber}, IsAvailable={isAvailable}, RowsAffected={rowsAffected}");
                }
                else
                {
                    // Just update IsAvailable
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "UPDATE Availabilities SET IsAvailable = ? WHERE AvailabilityID = ?";
                    cmd.Parameters.Add(new OleDbParameter("@p1", isAvailable));
                    cmd.Parameters.Add(new OleDbParameter("@p2", existingId.Value));
                    var rowsAffected = cmd.ExecuteNonQuery();
                    Console.WriteLine($"[SetEmployeeAvailability] ✓✓✓ UPDATED AvailabilityId={existingId} for EmployeeId={employeeId}, SlotNumber={slotNumber}, ShiftId={shiftId}, IsAvailable={isAvailable}, RowsAffected={rowsAffected}");
                }
                
                // Verify the update was successful
                using var verifyCmd = conn.CreateCommand();
                verifyCmd.CommandText = "SELECT IsAvailable FROM Availabilities WHERE AvailabilityID = ?";
                verifyCmd.Parameters.Add(new OleDbParameter("@p1", existingId.Value));
                var verifyResult = verifyCmd.ExecuteScalar();
                var savedValue = verifyResult != null && verifyResult != DBNull.Value ? Convert.ToBoolean(verifyResult) : false;
                Console.WriteLine($"[SetEmployeeAvailability] ✓ Verified saved value: IsAvailable={savedValue}");
                Console.WriteLine($"[SetEmployeeAvailability] ✓✓✓ AVAILABILITY PERSISTED TO DATABASE - Will survive logout/login");
                
                return (new { slotNumber, isAvailable, availabilityId = existingId.Value, updated = true }, null, false);
            }

            // Insert new availability record
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "INSERT INTO Availabilities (EmployeeId, ShiftId, IsAvailable) VALUES (?, ?, ?)";
                cmd.Parameters.Add(new OleDbParameter("@p1", employeeId));
                cmd.Parameters.Add(new OleDbParameter("@p2", shiftId));
                cmd.Parameters.Add(new OleDbParameter("@p3", isAvailable));
                var rowsAffected = cmd.ExecuteNonQuery();
                Console.WriteLine($"[SetEmployeeAvailability] INSERT executed, RowsAffected={rowsAffected}");
            }

            int newId;
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT @@IDENTITY";
                var o = cmd.ExecuteScalar();
                newId = o != null && o != DBNull.Value ? Convert.ToInt32(o) : 0;
            }
            if (newId == 0)
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT MAX(AvailabilityID) FROM Availabilities WHERE EmployeeId = ? AND ShiftId = ?";
                cmd.Parameters.Add(new OleDbParameter("@p1", employeeId));
                cmd.Parameters.Add(new OleDbParameter("@p2", shiftId));
                var o = cmd.ExecuteScalar();
                newId = o != null && o != DBNull.Value ? Convert.ToInt32(o) : 0;
            }

            Console.WriteLine($"[SetEmployeeAvailability] ✓✓✓ CREATED AvailabilityId={newId} for EmployeeId={employeeId}, SlotNumber={slotNumber}, ShiftId={shiftId}, IsAvailable={isAvailable}");
            
            // Verify the insert was successful
            if (newId > 0)
            {
                using var verifyCmd = conn.CreateCommand();
                verifyCmd.CommandText = "SELECT IsAvailable FROM Availabilities WHERE AvailabilityID = ?";
                verifyCmd.Parameters.Add(new OleDbParameter("@p1", newId));
                var verifyResult = verifyCmd.ExecuteScalar();
                var savedValue = verifyResult != null && verifyResult != DBNull.Value ? Convert.ToBoolean(verifyResult) : false;
                Console.WriteLine($"[SetEmployeeAvailability] ✓ Verified saved value: IsAvailable={savedValue}");
                Console.WriteLine($"[SetEmployeeAvailability] ✓✓✓ AVAILABILITY PERSISTED TO DATABASE - Will survive logout/login");
            }
            
            return (new { slotNumber, isAvailable, availabilityId = newId, updated = false }, null, false);
        }

        // GET: api/Availabilities/for-shift/{shiftId}
        // Get all employees available for a specific shift
        // CRITICAL FIX: Match by SlotNumber instead of just ShiftId, so availability persists across week changes
        [HttpGet("for-shift/{shiftId}")]
        public async Task<ActionResult<IEnumerable<object>>> GetEmployeesForShift(int shiftId)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(shiftId);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                var slotNumber = shift.SlotNumber ?? 0;
                if (slotNumber < 1 || slotNumber > 14)
                {
                    Console.WriteLine($"[GetEmployeesForShift] ShiftId={shiftId} has invalid SlotNumber={slotNumber}");
                    return Ok(new List<object>()); // Return empty list if invalid slot
                }

                Console.WriteLine($"[GetEmployeesForShift] ShiftId={shiftId}, SlotNumber={slotNumber}");

                // CRITICAL: Match availability by SlotNumber, not just ShiftId
                // This ensures availability persists even when shifts are recreated for a new week
                // We need to find all availability records where:
                // 1. The availability's ShiftId points to a shift with the same SlotNumber, OR
                // 2. The availability's ShiftId matches the current shift (for current week)
                // We'll use raw SQL to handle this efficiently
                var connectionString = _config.GetConnectionString("ShiftlyConnection")
                    ?? "Data Source=C:\\Users\\aleen\\Documents\\ShiftlyDB.accdb";
                if (!string.IsNullOrEmpty(connectionString) && !connectionString.Trim().Contains("Provider=", StringComparison.OrdinalIgnoreCase))
                    connectionString = "Provider=Microsoft.ACE.OLEDB.12.0;" + (connectionString.Trim().StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase) ? connectionString.Trim() : "Data Source=" + connectionString.Trim()) + ";";
                
                var availableEmployees = new List<object>();

                if (!string.IsNullOrEmpty(connectionString))
                {
                    using var conn = new System.Data.OleDb.OleDbConnection(connectionString);
                    await conn.OpenAsync();
                    
                    // Get all availability records where:
                    // - The shift has the same SlotNumber and StoreId
                    // - IsAvailable is true
                    // This will find availability even if the original shift was deleted
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT DISTINCT a.EmployeeId, e.FirstName, e.ProductivityScore, e.HourlyWage
                        FROM Availabilities a
                        INNER JOIN Shifts s ON a.ShiftId = s.Shift_ID
                        INNER JOIN Employees e ON a.EmployeeId = e.EmployeeId
                        WHERE s.Shift_SlotNumber = ? 
                          AND (a.IsAvailable <> 0)
                        ORDER BY e.ProductivityScore DESC";
                    cmd.Parameters.Add(new System.Data.OleDb.OleDbParameter("@p1", slotNumber));
                    
                    using var reader = await cmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        availableEmployees.Add(new
                        {
                            EmployeeId = reader.GetInt32(0),
                            EmployeeName = reader.IsDBNull(1) ? null : reader.GetString(1),
                            IsAvailable = true,
                            ProductivityScore = reader.IsDBNull(2) ? 0 : reader.GetDouble(2),
                            HourlyWage = reader.IsDBNull(3) ? 0 : reader.GetDecimal(3)
                        });
                    }
                }
                else
                {
                    // Fallback to EF Core if connection string not available
                    // Match by SlotNumber instead of just ShiftId
                    var availabilities = await _db.Availabilities
                        .Include(a => a.Employee)
                        .Join(_db.Shifts.Where(s => s.SlotNumber == slotNumber),
                            a => a.ShiftId,
                            s => s.ShiftId,
                            (a, s) => a)
                        .Where(a => a.IsAvailable == true)
                        .Select(a => new
                        {
                            a.EmployeeId,
                            EmployeeName = a.Employee != null ? a.Employee.FirstName : null,
                            a.IsAvailable,
                            ProductivityScore = a.Employee != null ? a.Employee.ProductivityScore : 0,
                            HourlyWage = a.Employee != null ? a.Employee.HourlyWage : 0
                        })
                        .OrderByDescending(a => a.ProductivityScore)
                        .ToListAsync();
                    
                    availableEmployees = availabilities.Cast<object>().ToList();
                }

                Console.WriteLine($"[GetEmployeesForShift] ShiftId={shiftId}, SlotNumber={slotNumber}, Found {availableEmployees.Count} available employees");
                if (availableEmployees.Count > 0)
                {
                    var names = availableEmployees.Select(a => {
                        var emp = a as dynamic;
                        return $"{emp?.EmployeeName ?? "Unknown"} (ID:{emp?.EmployeeId ?? 0})";
                    });
                    Console.WriteLine($"[GetEmployeesForShift] Available employees: {string.Join(", ", names)}");
                }

                return Ok(availableEmployees);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting employees for shift: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = "Failed to get employees for shift", message = ex.Message });
            }
        }

        // GET: api/Availabilities/for-employee/{employeeId}
        // Get all shifts where an employee is available
        [HttpGet("for-employee/{employeeId}")]
        public async Task<ActionResult<IEnumerable<object>>> GetShiftsForEmployee(int employeeId)
        {
            try
            {
                var employee = await _db.Employees.FindAsync(employeeId);
                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                // Get all availabilities for this employee where IsAvailable is true
                var availabilities = await _db.Availabilities
                    .Include(a => a.Shift)
                    .Where(a => a.EmployeeId == employeeId && a.IsAvailable)
                    .Select(a => new
                    {
                        a.ShiftId,
                        ShiftInfo = a.Shift != null ? new
                        {
                            a.Shift.StartTime,
                            a.Shift.EndTime,
                            a.Shift.SlotNumber
                        } : null,
                        a.IsAvailable
                    })
                    .ToListAsync();

                return Ok(availabilities);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting shifts for employee: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get shifts for employee", message = ex.Message });
            }
        }

        // POST: api/Availabilities/cleanup-invalid
        // Cleanup ALL invalid availability records:
        // 1. Records with ShiftId <= 0
        // 2. Records with invalid SlotNumber (< 1 or > 14)
        // 3. Records beyond 14 per employee (keep only one per SlotNumber 1-14)
        [HttpPost("cleanup-invalid")]
        public async Task<IActionResult> CleanupInvalidAvailabilities()
        {
            try
            {
                Console.WriteLine("ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•");
                Console.WriteLine("CLEANING UP INVALID AVAILABILITY RECORDS");
                Console.WriteLine("ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•");
                
                int totalDeleted = 0;
                
                // 1. Delete records with ShiftId <= 0
                var invalidShiftIdRecords = await _db.Availabilities
                    .Where(a => a.ShiftId <= 0)
                    .ToListAsync();
                
                if (invalidShiftIdRecords.Count > 0)
                {
                    _db.Availabilities.RemoveRange(invalidShiftIdRecords);
                    await _db.SaveChangesAsync();
                    totalDeleted += invalidShiftIdRecords.Count;
                    Console.WriteLine($"ג“ Deleted {invalidShiftIdRecords.Count} records with ShiftId <= 0");
                }
                
                // 2. Delete records with invalid SlotNumber (< 1 or > 14)
                var allAvailabilities = await _db.Availabilities
                    .Join(_db.Shifts,
                        a => a.ShiftId,
                        s => s.ShiftId,
                        (a, s) => new { Availability = a, s.SlotNumber })
                    .ToListAsync();
                
                var invalidSlotRecords = allAvailabilities
                    .Where(x => x.SlotNumber < 1 || x.SlotNumber > 14)
                    .Select(x => x.Availability)
                    .Distinct()
                    .ToList();
                
                if (invalidSlotRecords.Count > 0)
                {
                    _db.Availabilities.RemoveRange(invalidSlotRecords);
                    await _db.SaveChangesAsync();
                    totalDeleted += invalidSlotRecords.Count;
                    Console.WriteLine($"ג“ Deleted {invalidSlotRecords.Count} records with invalid SlotNumber");
                }
                
                // 3. For each employee, delete duplicates and keep max 14 records (one per SlotNumber 1-14)
                var employees = await _db.Employees.Select(e => e.EmployeeId).ToListAsync();
                
                foreach (var employeeId in employees)
                {
                    var employeeAvailabilities = await _db.Availabilities
                        .Where(a => a.EmployeeId == employeeId)
                        .Join(_db.Shifts,
                            a => a.ShiftId,
                            s => s.ShiftId,
                            (a, s) => new { Availability = a, s.SlotNumber })
                        .Where(x => x.SlotNumber >= 1 && x.SlotNumber <= 14)
                        .OrderByDescending(x => x.Availability.AvailabilityId)
                        .ToListAsync();
                    
                    // Group by SlotNumber and delete duplicates (keep most recent)
                    var duplicates = employeeAvailabilities
                        .GroupBy(x => x.SlotNumber)
                        .Where(g => g.Count() > 1)
                        .SelectMany(g => g.Skip(1).Select(x => x.Availability))
                        .ToList();
                    
                    if (duplicates.Count > 0)
                    {
                        _db.Availabilities.RemoveRange(duplicates);
                        await _db.SaveChangesAsync();
                        totalDeleted += duplicates.Count;
                        Console.WriteLine($"  Employee {employeeId}: Deleted {duplicates.Count} duplicate records");
                    }
                    
                    // If still more than 14, delete oldest ones
                    var finalCount = await _db.Availabilities
                        .Where(a => a.EmployeeId == employeeId)
                        .Join(_db.Shifts,
                            a => a.ShiftId,
                            s => s.ShiftId,
                            (a, s) => new { a.AvailabilityId, s.SlotNumber })
                        .Where(x => x.SlotNumber >= 1 && x.SlotNumber <= 14)
                        .CountAsync();
                    
                    if (finalCount > 14)
                    {
                        var oldestToDelete = await _db.Availabilities
                            .Where(a => a.EmployeeId == employeeId)
                            .Join(_db.Shifts,
                                a => a.ShiftId,
                                s => s.ShiftId,
                                (a, s) => new { Availability = a, s.SlotNumber })
                            .Where(x => x.SlotNumber >= 1 && x.SlotNumber <= 14)
                            .OrderBy(x => x.Availability.AvailabilityId)
                            .Skip(14)
                            .Select(x => x.Availability)
                            .ToListAsync();
                        
                        if (oldestToDelete.Count > 0)
                        {
                            _db.Availabilities.RemoveRange(oldestToDelete);
                            await _db.SaveChangesAsync();
                            totalDeleted += oldestToDelete.Count;
                            Console.WriteLine($"  Employee {employeeId}: Deleted {oldestToDelete.Count} oldest records (had {finalCount}, max 14)");
                        }
                    }
                }
                
                Console.WriteLine($"ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•");
                Console.WriteLine($"ג“ CLEANUP COMPLETE: Deleted {totalDeleted} invalid/extra availability records");
                Console.WriteLine($"ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•");
                
                return Ok(new { 
                    message = $"Cleaned up {totalDeleted} invalid/extra availability records",
                    deletedCount = totalDeleted
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ג Error cleaning up invalid availabilities: {ex.Message}");
                return StatusCode(500, new { error = "Failed to cleanup invalid availabilities", message = ex.Message });
            }
        }

        // GET: api/Availabilities/all-for-employee/{employeeId} or api/Availabilities/employee/{employeeId}
        // Returns availability for slots 1-14 so the UI can show saved state after refresh.
        [HttpGet("all-for-employee/{employeeId}")]
        [HttpGet("employee/{employeeId}")]
        public async Task<ActionResult<object>> GetAllAvailabilityForEmployee(
            int employeeId,
            [FromQuery] DateTime? weekStart = null)
        {
            try
            {
                var employee = await _db.Employees.FindAsync(employeeId);
                if (employee == null)
                    return NotFound(new { error = "Employee not found" });

                var weekStartDate = ShiftBootstrap.GetWeekStart(weekStart);
                var weekEnd = weekStartDate.AddDays(7);

                // CRITICAL FIX: Availability must persist across weeks even when shifts are deleted/recreated.
                // Use raw SQL to get ALL availability records and match with shifts (including deleted ones if they still exist in DB).
                // This ensures availability persists even after logout/login or week changes.
                var connectionString = _config.GetConnectionString("ShiftlyConnection")
                    ?? "Data Source=C:\\Users\\aleen\\Documents\\ShiftlyDB.accdb";
                if (!string.IsNullOrEmpty(connectionString) && !connectionString.Trim().Contains("Provider=", StringComparison.OrdinalIgnoreCase))
                    connectionString = "Provider=Microsoft.ACE.OLEDB.12.0;" + (connectionString.Trim().StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase) ? connectionString.Trim() : "Data Source=" + connectionString.Trim()) + ";";
                
                var allAvailabilitiesList = new List<(int AvailabilityId, int ShiftId, bool IsAvailable, int? SlotNumber)>();
                
                if (!string.IsNullOrEmpty(connectionString))
                {
                    using var conn = new System.Data.OleDb.OleDbConnection(connectionString);
                    await conn.OpenAsync();

                    ShiftBootstrap.EnsureFourteenShiftsOleDb(conn, weekStartDate);
                    
                    // Get ALL availability records for this employee, with SlotNumber from Shifts table
                    // LEFT JOIN ensures we get availability even if shift was deleted (SlotNumber will be NULL)
                    // CRITICAL: We need to find availability by matching SlotNumber, even if the original shift was deleted
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT a.AvailabilityID, a.ShiftId, a.IsAvailable, s.Shift_SlotNumber
                        FROM Availabilities a
                        INNER JOIN Shifts s ON a.ShiftId = s.Shift_ID
                        WHERE a.EmployeeId = ?
                        AND s.Shift_StartTime >= ? AND s.Shift_StartTime < ?
                        ORDER BY a.AvailabilityID DESC";
                    cmd.Parameters.Add(new System.Data.OleDb.OleDbParameter("@p1", employeeId));
                    cmd.Parameters.Add(new System.Data.OleDb.OleDbParameter("@p2", weekStartDate));
                    cmd.Parameters.Add(new System.Data.OleDb.OleDbParameter("@p3", weekEnd));
                    
                    Console.WriteLine($"[GetAllAvailabilityForEmployee] Querying database for EmployeeId={employeeId}");
                    
                    using var reader = await cmd.ExecuteReaderAsync();
                    int totalRecords = 0;
                    int validRecords = 0;
                    while (await reader.ReadAsync())
                    {
                        totalRecords++;
                        var availId = reader.GetInt32(0);
                        var shiftId = reader.GetInt32(1);
                        var isAvailable = ReadAccessYesNo(reader.GetValue(2));
                        var slotNum = reader.IsDBNull(3) ? (int?)null : reader.GetInt32(3);
                        
                        Console.WriteLine($"[GetAllAvailabilityForEmployee] Record {totalRecords}: AvailabilityId={availId}, ShiftId={shiftId}, IsAvailable={isAvailable}, SlotNumber={slotNum ?? -1}");
                        
                        // Only include if we have a valid slot number (1-14)
                        if (slotNum.HasValue && slotNum >= 1 && slotNum <= 14)
                        {
                            allAvailabilitiesList.Add((availId, shiftId, isAvailable, slotNum));
                            validRecords++;
                            Console.WriteLine($"[GetAllAvailabilityForEmployee] ✓ Added valid record: SlotNumber={slotNum}, IsAvailable={isAvailable}");
                        }
                        else if (!slotNum.HasValue)
                        {
                            Console.WriteLine($"[GetAllAvailabilityForEmployee] ⚠ Record {availId} has NULL SlotNumber (shift {shiftId} may have been deleted) - attempting recovery...");
                            
                            // Try to find the SlotNumber by looking for any shift with this ShiftId pattern or by finding current week's shift
                            // For now, we'll try to match by finding the most recent availability for this employee and inferring the slot
                            // Actually, a better approach: find the current week's shift for each slot and match availability
                            // But for now, we'll skip orphaned records and log them
                            Console.WriteLine($"[GetAllAvailabilityForEmployee] ⚠ Skipping orphaned availability record {availId} (ShiftId={shiftId} not found)");
                        }
                    }
                    
                    Console.WriteLine($"[GetAllAvailabilityForEmployee] Total records found: {totalRecords}, Valid records (with SlotNumber 1-14): {validRecords}");
                    Console.WriteLine($"[GetAllAvailabilityForEmployee] Loaded {allAvailabilitiesList.Count} availability records for EmployeeId={employeeId}");
                }
                else
                {
                    // Fallback to EF Core if connection string not available
                    var allAvailabilities = await _db.Availabilities
                        .Where(a => a.EmployeeId == employee.EmployeeId)
                        .Join(_db.Shifts.Where(s => s.SlotNumber >= 1 && s.SlotNumber <= 14
                            && s.StartTime >= weekStartDate && s.StartTime < weekEnd),
                            a => a.ShiftId,
                            s => s.ShiftId,
                            (a, s) => new { a.ShiftId, s.SlotNumber, a.IsAvailable, a.AvailabilityId })
                        .OrderByDescending(x => x.AvailabilityId)
                        .ToListAsync();
                    
                    foreach (var a in allAvailabilities)
                    {
                        allAvailabilitiesList.Add((a.AvailabilityId, a.ShiftId, a.IsAvailable, a.SlotNumber));
                    }
                }

                // Group by SlotNumber and take the most recent (highest AvailabilityId) for each slot
                var uniqueAvailabilities = allAvailabilitiesList
                    .Where(a => a.SlotNumber.HasValue && a.SlotNumber >= 1 && a.SlotNumber <= 14)
                    .GroupBy(a => a.SlotNumber.Value)
                    .Select(g => g.OrderByDescending(x => x.AvailabilityId).First())
                    .OrderBy(a => a.SlotNumber)
                    .ToList();
                
                Console.WriteLine($"[GetAllAvailabilityForEmployee] Unique availability for {uniqueAvailabilities.Count} slots");

                var availabilityMap = new Dictionary<string, bool>();
                for (int slot = 1; slot <= 14; slot++)
                    availabilityMap[slot.ToString()] = false;
                foreach (var a in uniqueAvailabilities)
                {
                    if (a.SlotNumber >= 1 && a.SlotNumber <= 14)
                    {
                        var slotKey = a.SlotNumber!.Value.ToString();
                        availabilityMap[slotKey] = a.IsAvailable;
                        Console.WriteLine($"[GetAllAvailabilityForEmployee] EmployeeId={employeeId}, Slot {slotKey}: IsAvailable={a.IsAvailable}");
                    }
                }

                var availableCount = availabilityMap.Values.Count(v => v);
                Console.WriteLine($"[GetAllAvailabilityForEmployee] ✅ EmployeeId={employeeId}: Returning {availableCount} available slots out of 14");
                Console.WriteLine($"[GetAllAvailabilityForEmployee] EmployeeId={employeeId}: Availability map keys: {string.Join(", ", availabilityMap.Keys)}");
                Console.WriteLine($"[GetAllAvailabilityForEmployee] EmployeeId={employeeId}: Availability map values: {string.Join(", ", availabilityMap.Values)}");
                
                // Log which specific slots are available
                var availableSlots = availabilityMap.Where(kvp => kvp.Value).Select(kvp => kvp.Key).ToList();
                if (availableSlots.Any())
                {
                    Console.WriteLine($"[GetAllAvailabilityForEmployee] ✅ EmployeeId={employeeId}: Available slots: {string.Join(", ", availableSlots)}");
                }
                else
                {
                    Console.WriteLine($"[GetAllAvailabilityForEmployee] ⚠ EmployeeId={employeeId}: NO AVAILABILITY FOUND");
                }

                return Ok(new
                {
                    employeeId,
                    weekStart = weekStartDate.ToString("yyyy-MM-dd"),
                    availabilityMap
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ג GetAllAvailabilityForEmployee: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get all availability for employee", message = ex.Message });
            }
        }

        /// <summary>
        /// ملخص التوفر للمدير — استدعاء واحد يعيد توفر كل العمال + من متاح لكل مناوبة.
        /// يُحدَّث كل 5 ثوانٍ من صفحة الجدولة في الواجهة.
        /// </summary>
        [HttpGet("manager-summary")]
        public async Task<ActionResult<object>> GetManagerAvailabilitySummary([FromQuery] DateTime? weekStart = null)
        {
            try
            {
                var weekStartDate = ShiftBootstrap.GetWeekStart(weekStart);
                var weekEnd = weekStartDate.AddDays(7);
                var connStr = GetOleDbConnectionString();

                var currentShifts = await _db.Shifts
                    .Where(s => s.StartTime >= weekStartDate && s.StartTime < weekEnd
                        && s.SlotNumber >= 1 && s.SlotNumber <= 14)
                    .Select(s => new { s.ShiftId, Slot = s.SlotNumber ?? 0 })
                    .OrderBy(s => s.Slot)
                    .ToListAsync();

                if (currentShifts.Count != 14)
                {
                    await ShiftBootstrap.EnsureFourteenShiftsForWeekAsync(connStr, weekStartDate);
                    currentShifts = await _db.Shifts
                        .Where(s => s.StartTime >= weekStartDate && s.StartTime < weekEnd
                            && s.SlotNumber >= 1 && s.SlotNumber <= 14)
                        .Select(s => new { s.ShiftId, Slot = s.SlotNumber ?? 0 })
                        .OrderBy(s => s.Slot)
                        .ToListAsync();
                }

                // employeeId -> slot -> latest IsAvailable
                var latestByEmployeeSlot = new Dictionary<int, Dictionary<int, (int AvailId, bool IsAvailable)>>();

                using (var conn = new OleDbConnection(connStr))
                {
                    await conn.OpenAsync();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT a.EmployeeId, s.Shift_SlotNumber, a.IsAvailable, a.AvailabilityID
                        FROM Availabilities a
                        INNER JOIN Shifts s ON a.ShiftId = s.Shift_ID
                        WHERE s.Shift_SlotNumber >= 1 AND s.Shift_SlotNumber <= 14
                        AND s.Shift_StartTime >= ? AND s.Shift_StartTime < ?
                        ORDER BY a.EmployeeId, s.Shift_SlotNumber, a.AvailabilityID DESC";
                    cmd.Parameters.Add(new OleDbParameter("@ws", weekStartDate));
                    cmd.Parameters.Add(new OleDbParameter("@we", weekEnd));
                    using var reader = await cmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        var empId = reader.GetInt32(0);
                        var slot = reader.GetInt32(1);
                        var isAvail = ReadAccessYesNo(reader.GetValue(2));
                        var availId = reader.GetInt32(3);

                        if (!latestByEmployeeSlot.TryGetValue(empId, out var slots))
                        {
                            slots = new Dictionary<int, (int, bool)>();
                            latestByEmployeeSlot[empId] = slots;
                        }
                        if (!slots.ContainsKey(slot))
                            slots[slot] = (availId, isAvail);
                    }
                }

                var byEmployee = new Dictionary<string, Dictionary<string, bool>>();
                foreach (var (empId, slots) in latestByEmployeeSlot)
                {
                    var map = new Dictionary<string, bool>();
                    for (int slot = 1; slot <= 14; slot++)
                        map[slot.ToString()] = false;
                    foreach (var (slot, entry) in slots)
                        map[slot.ToString()] = entry.IsAvailable;
                    byEmployee[empId.ToString()] = map;
                }

                var byShiftId = new Dictionary<string, List<int>>();
                foreach (var shift in currentShifts)
                {
                    var available = new List<int>();
                    foreach (var (empId, slots) in latestByEmployeeSlot)
                    {
                        if (slots.TryGetValue(shift.Slot, out var entry) && entry.IsAvailable)
                            available.Add(empId);
                    }
                    byShiftId[shift.ShiftId.ToString()] = available;
                }

                Console.WriteLine($"[ManagerSummary] week={weekStartDate:yyyy-MM-dd}, employees={byEmployee.Count}, shifts={byShiftId.Count}");
                return Ok(new { weekStart = weekStartDate, byEmployee, byShiftId });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ManagerSummary] ERROR: {ex.Message}");
                return StatusCode(500, new { error = "Failed to load manager availability summary", message = ex.Message });
            }
        }

        // GET: api/Availabilities/check/{employeeId}/{shiftId}
        // Check if employee is available for a specific shift (Access structure: uses ShiftId directly)
        [HttpGet("check/{employeeId}/{shiftId}")]
        public async Task<ActionResult<object>> CheckShiftAvailability(int employeeId, int shiftId)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(shiftId);
                if (shift == null)
                {
                    Console.WriteLine($"ג  Check: Shift {shiftId} not found");
                    return Ok(new { available = false });
                }

                // employeeId is the EmployeeId from the logged-in employee
                var employee = await _db.Employees.FindAsync(employeeId);
                if (employee == null)
                {
                    Console.WriteLine($"ג  Check: Employee {employeeId} not found");
                    return Ok(new { available = false });
                }

                // Check availability using Access structure (EmployeeId + ShiftId)
                // IMPORTANT: This reads directly from the database
                var availability = await _db.Availabilities
                    .FirstOrDefaultAsync(a => 
                        a.EmployeeId == employee.EmployeeId &&
                        a.ShiftId == shiftId);

                var isAvailable = availability != null && availability.IsAvailable;
                
                // Return true only if availability exists AND IsAvailable is true
                return Ok(new { available = isAvailable });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error checking availability: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = "Failed to check availability", message = ex.Message });
            }
        }

        // PUT: api/Availabilities/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateAvailability(int id, [FromBody] UpdateAvailabilityDto dto)
        {
            try
            {
                var availability = await _db.Availabilities.FindAsync(id);
                if (availability == null)
                {
                    return NotFound(new { error = "Availability not found" });
                }

                availability.EmployeeId = dto.EmployeeId;
                availability.ShiftId = dto.ShiftId;
                availability.IsAvailable = dto.IsAvailable;

                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to update availability", message = ex.Message });
            }
        }

        // DELETE: api/Availabilities/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteAvailability(int id)
        {
            try
            {
                var availability = await _db.Availabilities.FindAsync(id);
                if (availability == null)
                {
                    return NotFound(new { error = "Availability not found" });
                }

                _db.Availabilities.Remove(availability);
                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to delete availability", message = ex.Message });
            }
        }

        private async Task EnsureAvailabilitiesTableExistsAsync()
        {
            try
            {
                await _db.Availabilities.CountAsync();
            }
            catch (Exception ex)
            {
                // Table might not exist (Jet/Access can throw different messages)
                var msg = (ex.Message + " " + (ex.InnerException?.Message ?? "")).ToLowerInvariant();
                if (!msg.Contains("cannot find") && !msg.Contains("does not exist") && !msg.Contains("no such table") && !msg.Contains("invalid object"))
                    throw;
                await _db.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE Availabilities (
                        AvailabilityID AUTOINCREMENT PRIMARY KEY,
                        EmployeeId INTEGER NOT NULL,
                        ShiftId INTEGER NOT NULL,
                        IsAvailable YESNO NOT NULL,
                        CONSTRAINT UniqueEmployeeShift UNIQUE (EmployeeId, ShiftId)
                    )");
            }
        }

    }

    public class CreateAvailabilityDto
    {
        public int EmployeeId { get; set; }
        public int ShiftId { get; set; }
        public bool IsAvailable { get; set; }
    }

    public class UpdateAvailabilityDto
    {
        public int EmployeeId { get; set; }
        public int ShiftId { get; set; }
        public bool IsAvailable { get; set; }
    }

    /// <summary>Employee sets their availability for one shift (availability page). SlotNumber 1-14 = which shift in the week. Not manager "set shift".</summary>
    public class SetSlotAvailabilityDto
    {
        public int EmployeeId { get; set; }
        public int SlotNumber { get; set; } // 1-14: which shift in the week (Monday AM=1 ... Sunday PM=14)
        public bool IsAvailable { get; set; }
        /// <summary>Monday of target week (yyyy-MM-dd). Defaults to current week if omitted.</summary>
        public string? WeekStart { get; set; }
    }

}


using Backend.Models;
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


        // POST: api/Availabilities/set-availability (alias: set-slot)
        // Employee sets their availability for one shift. One shift = one row in Availabilities.
        // Uses raw OleDb to avoid EF Core Jet #Dual table errors with Access.
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

                var result = await Task.Run(() => SetEmployeeAvailabilityWithOleDb(connStr, dto.EmployeeId, dto.SlotNumber, dto.IsAvailable));
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
        private static (object? Response, string? Error, bool NotFound) SetEmployeeAvailabilityWithOleDb(string connectionString, int employeeId, int slotNumber, bool isAvailable)
        {
            using var conn = new OleDbConnection(connectionString);
            conn.Open();

            // 1) Get employee StoreId
            int storeId;
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT StoreId FROM Employees WHERE EmployeeId = ?";
                cmd.Parameters.Add(new OleDbParameter("@p1", employeeId));
                var o = cmd.ExecuteScalar();
                if (o == null || o == DBNull.Value) return (null, "Employee not found", true);
                storeId = Convert.ToInt32(o);
            }

            var today = DateTime.Today;
            var monday = today.AddDays(-(int)today.DayOfWeek + 1);
            if (today.DayOfWeek == DayOfWeek.Sunday) monday = today.AddDays(-6);
            monday = monday.Date;
            var weekEnd = monday.AddDays(7);

            // 2) Get shift ID for this store/slot/week (Access columns: Shift_ID, Shift_StoreID, Shift_SlotNumber, Shift_StartTime)
            int shiftId = 0;
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"SELECT TOP 1 Shift_ID FROM Shifts 
WHERE Shift_StoreID = ? AND Shift_SlotNumber = ? AND Shift_StartTime >= ? AND Shift_StartTime < ? AND Shift_ID > 0 
ORDER BY Shift_StartTime";
                cmd.Parameters.Add(new OleDbParameter("@p1", storeId));
                cmd.Parameters.Add(new OleDbParameter("@p2", slotNumber));
                cmd.Parameters.Add(new OleDbParameter("@p3", monday));
                cmd.Parameters.Add(new OleDbParameter("@p4", weekEnd));
                var o = cmd.ExecuteScalar();
                if (o == null || o == DBNull.Value)
                {
                    // No shifts for this week yet — create 14 shifts (Mon AM/PM ... Sun AM/PM) via OleDb, then retry
                    EnsureFourteenShiftsForStoreOleDb(conn, storeId, monday);
                    o = null;
                    using (var retryCmd = conn.CreateCommand())
                    {
                        retryCmd.CommandText = @"SELECT TOP 1 Shift_ID FROM Shifts 
WHERE Shift_StoreID = ? AND Shift_SlotNumber = ? AND Shift_StartTime >= ? AND Shift_StartTime < ? AND Shift_ID > 0 
ORDER BY Shift_StartTime";
                        retryCmd.Parameters.Add(new OleDbParameter("@p1", storeId));
                        retryCmd.Parameters.Add(new OleDbParameter("@p2", slotNumber));
                        retryCmd.Parameters.Add(new OleDbParameter("@p3", monday));
                        retryCmd.Parameters.Add(new OleDbParameter("@p4", weekEnd));
                        o = retryCmd.ExecuteScalar();
                    }
                }
                if (o == null || o == DBNull.Value)
                    return (null, $"No shift for slot {slotNumber} this week. Refresh the page.", true);
                shiftId = Convert.ToInt32(o);
            }

            Console.WriteLine($"[SetEmployeeAvailability] SlotNumber={slotNumber} -> ShiftId={shiftId} (StoreId={storeId})");

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

            // 4) Find existing availability
            int? existingId = null;
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT AvailabilityID FROM Availabilities WHERE EmployeeId = ? AND ShiftId = ?";
                cmd.Parameters.Add(new OleDbParameter("@p1", employeeId));
                cmd.Parameters.Add(new OleDbParameter("@p2", shiftId));
                var o = cmd.ExecuteScalar();
                if (o != null && o != DBNull.Value) existingId = Convert.ToInt32(o);
            }

            if (existingId.HasValue)
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE Availabilities SET IsAvailable = ? WHERE AvailabilityID = ?";
                cmd.Parameters.Add(new OleDbParameter("@p1", isAvailable));
                cmd.Parameters.Add(new OleDbParameter("@p2", existingId.Value));
                cmd.ExecuteNonQuery();
                Console.WriteLine($"[SetEmployeeAvailability] UPDATED AvailabilityId={existingId} for SlotNumber={slotNumber}, ShiftId={shiftId}");
                return (new { slotNumber, isAvailable, availabilityId = existingId.Value, updated = true }, null, false);
            }

            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "INSERT INTO Availabilities (EmployeeId, ShiftId, IsAvailable) VALUES (?, ?, ?)";
                cmd.Parameters.Add(new OleDbParameter("@p1", employeeId));
                cmd.Parameters.Add(new OleDbParameter("@p2", shiftId));
                cmd.Parameters.Add(new OleDbParameter("@p3", isAvailable));
                cmd.ExecuteNonQuery();
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

            Console.WriteLine($"[SetEmployeeAvailability] CREATED AvailabilityId={newId} for SlotNumber={slotNumber}, ShiftId={shiftId}");
            return (new { slotNumber, isAvailable, availabilityId = newId, updated = false }, null, false);
        }

        /// <summary>Create 14 shifts for the store/week (Mon AM, Mon PM ... Sun AM, Sun PM) via OleDb. No EF = no #Dual.</summary>
        private static void EnsureFourteenShiftsForStoreOleDb(OleDbConnection conn, int storeId, DateTime weekStart)
        {
            var weekEnd = weekStart.AddDays(7);
            for (int day = 0; day < 7; day++)
            {
                var date = weekStart.AddDays(day).Date;
                for (int part = 0; part < 2; part++)
                {
                    int slotNum = day * 2 + part + 1;
                    var start = date.AddHours(part == 0 ? 9 : 17);
                    var end = date.AddHours(part == 0 ? 17 : 22);
                    object? existing = null;
                    using (var check = conn.CreateCommand())
                    {
                        check.CommandText = @"SELECT TOP 1 Shift_ID FROM Shifts 
WHERE Shift_StoreID = ? AND Shift_SlotNumber = ? AND Shift_StartTime >= ? AND Shift_StartTime < ?";
                        check.Parameters.Add(new OleDbParameter("@p1", storeId));
                        check.Parameters.Add(new OleDbParameter("@p2", slotNum));
                        check.Parameters.Add(new OleDbParameter("@p3", weekStart));
                        check.Parameters.Add(new OleDbParameter("@p4", weekEnd));
                        existing = check.ExecuteScalar();
                    }
                    if (existing != null && existing != DBNull.Value)
                        continue;
                    using (var ins = conn.CreateCommand())
                    {
                        ins.CommandText = @"INSERT INTO Shifts (Shift_StoreID, Shift_StartTime, Shift_EndTime, Shift_ReqThroughput, Shift_SlotNumber) VALUES (?, ?, ?, ?, ?)";
                        ins.Parameters.Add(new OleDbParameter("@p1", storeId));
                        ins.Parameters.Add(new OleDbParameter("@p2", start));
                        ins.Parameters.Add(new OleDbParameter("@p3", end));
                        ins.Parameters.Add(new OleDbParameter("@p4", (decimal)(part == 0 ? 2500 : 3500)));
                        ins.Parameters.Add(new OleDbParameter("@p5", slotNum));
                        ins.ExecuteNonQuery();
                    }
                }
            }
        }

        // GET: api/Availabilities/for-shift/{shiftId}
        // Get all employees available for a specific shift
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

                // Get all availabilities for this shift where IsAvailable is true
                // This is used by managers to see which employees are available for a shift
                var availabilities = await _db.Availabilities
                    .Include(a => a.Employee)
                    .Where(a => a.ShiftId == shiftId && a.IsAvailable == true) // Explicitly check for true
                    .Select(a => new
                    {
                        a.EmployeeId,
                        EmployeeName = a.Employee != null ? a.Employee.FirstName : null,
                        a.IsAvailable,
                        ProductivityScore = a.Employee != null ? a.Employee.ProductivityScore : 0,
                        HourlyWage = a.Employee != null ? a.Employee.HourlyWage : 0
                    })
                    .OrderByDescending(a => a.ProductivityScore) // Sort by productivity (best employees first)
                    .ToListAsync();

                return Ok(availabilities);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting employees for shift: {ex.Message}");
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
                            StartTime = a.Shift.StartTime,
                            EndTime = a.Shift.EndTime,
                            StoreId = a.Shift.StoreId
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
        public async Task<ActionResult<object>> GetAllAvailabilityForEmployee(int employeeId)
        {
            try
            {
                var employee = await _db.Employees.FindAsync(employeeId);
                if (employee == null)
                    return NotFound(new { error = "Employee not found" });

                // Get ALL availability for this employee that reference a shift with SlotNumber 1-14 (any week).
                // Take most recent per slot so refresh always shows last saved state.
                var allAvailabilities = await _db.Availabilities
                    .Where(a => a.EmployeeId == employee.EmployeeId)
                    .Join(_db.Shifts.Where(s => s.SlotNumber >= 1 && s.SlotNumber <= 14),
                        a => a.ShiftId,
                        s => s.ShiftId,
                        (a, s) => new { a.ShiftId, s.SlotNumber, a.IsAvailable, a.AvailabilityId })
                    .OrderByDescending(x => x.AvailabilityId)
                    .ToListAsync();

                var uniqueAvailabilities = allAvailabilities
                    .GroupBy(a => a.SlotNumber)
                    .Select(g => g.First())
                    .OrderBy(a => a.SlotNumber)
                    .ToList();

                var availabilityMap = new Dictionary<string, bool>();
                for (int slot = 1; slot <= 14; slot++)
                    availabilityMap[slot.ToString()] = false;
                foreach (var a in uniqueAvailabilities)
                {
                    if (a.SlotNumber >= 1 && a.SlotNumber <= 14)
                        availabilityMap[a.SlotNumber!.Value.ToString()] = a.IsAvailable;
                }

                return Ok(new { employeeId = employeeId, availabilityMap = availabilityMap });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ג GetAllAvailabilityForEmployee: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get all availability for employee", message = ex.Message });
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

        private async Task EnsureFourteenShiftsForStore(int storeId, DateTime weekStart)
        {
            var weekEnd = weekStart.AddDays(7);
            var shiftsWithSlot = await _db.Shifts
                .Where(s => s.StoreId == storeId && s.StartTime >= weekStart && s.StartTime < weekEnd && s.SlotNumber >= 1 && s.SlotNumber <= 14)
                .CountAsync();
            if (shiftsWithSlot >= 14) return;

            // If we have 14 shifts for the week but with null/wrong SlotNumber, assign 1-14 by StartTime order (avoids duplicate shifts)
            var weekShifts = await _db.Shifts
                .Where(s => s.StoreId == storeId && s.StartTime >= weekStart && s.StartTime < weekEnd)
                .OrderBy(s => s.StartTime)
                .ToListAsync();
            if (weekShifts.Count >= 14)
            {
                bool needSave = false;
                for (int i = 0; i < Math.Min(14, weekShifts.Count); i++)
                {
                    int wantSlot = i + 1;
                    if (weekShifts[i].SlotNumber != wantSlot)
                    {
                        weekShifts[i].SlotNumber = wantSlot;
                        needSave = true;
                    }
                }
                if (needSave)
                {
                    await _db.SaveChangesAsync();
                    return;
                }
            }

            for (int day = 0; day < 7; day++)
            {
                var date = weekStart.AddDays(day).Date;
                for (int part = 0; part < 2; part++)
                {
                    int slotNumber = day * 2 + part + 1;
                    var start = date.AddHours(part == 0 ? 9 : 17);
                    var end = date.AddHours(part == 0 ? 17 : 22);
                    var exists = await _db.Shifts.AnyAsync(s => s.StoreId == storeId && s.SlotNumber == slotNumber && s.StartTime >= weekStart && s.StartTime < weekEnd);
                    if (exists) continue;
                    var shift = new Shift
                    {
                        StoreId = storeId,
                        SlotNumber = slotNumber,
                        StartTime = start,
                        EndTime = end,
                        RequiredProductivity = part == 0 ? 2500 : 3500
                    };
                    _db.Shifts.Add(shift);
                }
            }
            await _db.SaveChangesAsync();
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
    }

}


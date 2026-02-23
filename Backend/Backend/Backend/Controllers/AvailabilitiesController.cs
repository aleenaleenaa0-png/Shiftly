using Backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AvailabilitiesController : ControllerBase
    {
        private readonly AppData _db;

        public AvailabilitiesController(AppData db)
        {
            _db = db;
        }

        // GET: api/Availabilities
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetAvailabilities([FromQuery] int? employeeId = null)
        {
            try
            {
                var query = _db.Availabilities.Include(a => a.Employee).AsQueryable();

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
                                    IsAvailable YESNO NOT NULL
                                )
                            ");
                            Console.WriteLine("✓ Created Availabilities table with Access structure");
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
                    ShiftId = dto.ShiftId,
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

        // POST: api/Availabilities/toggle
        // Toggle availability for a specific shift (Access structure: EmployeeId + ShiftId + IsAvailable)
        [HttpPost("toggle")]
        public async Task<IActionResult> ToggleShiftAvailability([FromBody] ToggleShiftAvailabilityDto dto)
        {
            try
            {
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine($"TOGGLE AVAILABILITY REQUEST");
                Console.WriteLine($"EmployeeId: {dto.EmployeeId}, ShiftId: {dto.ShiftId}");
                Console.WriteLine("═══════════════════════════════════════════════════════");

                // Ensure Availabilities table exists with Access structure
                try
                {
                    var testCount = await _db.Availabilities.CountAsync();
                    Console.WriteLine($"✓ Availabilities table exists with {testCount} records");
                }
                catch (Exception tableEx)
                {
                    if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist"))
                    {
                        Console.WriteLine("⚠ Availabilities table doesn't exist, creating it...");
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync(@"
                                CREATE TABLE Availabilities (
                                    AvailabilityID AUTOINCREMENT PRIMARY KEY,
                                    EmployeeId INTEGER NOT NULL,
                                    ShiftId INTEGER NOT NULL,
                                    IsAvailable YESNO NOT NULL
                                )
                            ");
                            Console.WriteLine("✓ Created Availabilities table with Access structure");
                        }
                        catch (Exception createEx)
                        {
                            Console.WriteLine($"❌ Failed to create table: {createEx.Message}");
                            return StatusCode(500, new 
                            { 
                                error = "Database setup error", 
                                message = $"Could not create Availabilities table: {createEx.Message}" 
                            });
                        }
                    }
                    else
                    {
                        Console.WriteLine($"⚠ Table check error: {tableEx.Message}");
                    }
                }

                // Verify shift exists
                var shift = await _db.Shifts.FindAsync(dto.ShiftId);
                if (shift == null)
                {
                    Console.WriteLine($"❌ Shift {dto.ShiftId} not found");
                    return NotFound(new { error = "Shift not found" });
                }
                Console.WriteLine($"✓ Shift {dto.ShiftId} found");

                // dto.EmployeeId is actually the EmployeeId from the logged-in employee
                // (When employees login, their EmployeeId is returned as userId)
                var employee = await _db.Employees.FindAsync(dto.EmployeeId);
                if (employee == null)
                {
                    Console.WriteLine($"❌ Employee {dto.EmployeeId} not found");
                    return NotFound(new { error = "Employee not found" });
                }
                Console.WriteLine($"✓ Employee {dto.EmployeeId} ({employee.FirstName}) found");

                // Check if availability already exists for this employee + shift combination
                var existingAvailability = await _db.Availabilities
                    .FirstOrDefaultAsync(a => 
                        a.EmployeeId == employee.EmployeeId &&
                        a.ShiftId == dto.ShiftId);

                if (existingAvailability != null)
                {
                    // Toggle IsAvailable (flip the boolean)
                    var oldValue = existingAvailability.IsAvailable;
                    existingAvailability.IsAvailable = !existingAvailability.IsAvailable;
                    await _db.SaveChangesAsync();
                    Console.WriteLine($"✓ Toggled availability from {oldValue} to {existingAvailability.IsAvailable}");
                    Console.WriteLine($"  AvailabilityId: {existingAvailability.AvailabilityId}");
                    return Ok(new { 
                        available = existingAvailability.IsAvailable, 
                        message = existingAvailability.IsAvailable ? "Availability set to available" : "Availability set to not available",
                        availabilityId = existingAvailability.AvailabilityId 
                    });
                }
                else
                {
                    // Create new availability record (default to available when first created)
                    var availability = new Availability
                    {
                        EmployeeId = employee.EmployeeId,
                        ShiftId = dto.ShiftId,
                        IsAvailable = true
                    };

                    _db.Availabilities.Add(availability);
                    await _db.SaveChangesAsync();
                    Console.WriteLine($"✓ Created new availability record");
                    Console.WriteLine($"  AvailabilityId: {availability.AvailabilityId}, IsAvailable: {availability.IsAvailable}");
                    return Ok(new { 
                        available = true, 
                        message = "Availability added", 
                        availabilityId = availability.AvailabilityId 
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine($"❌ ERROR TOGGLING AVAILABILITY");
                Console.WriteLine($"Error: {ex.Message}");
                Console.WriteLine($"Inner Exception: {ex.InnerException?.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                Console.WriteLine("═══════════════════════════════════════════════════════");
                return StatusCode(500, new { error = "Failed to toggle availability", message = ex.Message });
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
                var availabilities = await _db.Availabilities
                    .Include(a => a.Employee)
                    .Where(a => a.ShiftId == shiftId && a.IsAvailable)
                    .Select(a => new
                    {
                        a.EmployeeId,
                        EmployeeName = a.Employee != null ? a.Employee.FirstName : null,
                        a.IsAvailable
                    })
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
                    Console.WriteLine($"⚠ Check: Shift {shiftId} not found");
                    return Ok(new { available = false });
                }

                // employeeId is the EmployeeId from the logged-in employee
                var employee = await _db.Employees.FindAsync(employeeId);
                if (employee == null)
                {
                    Console.WriteLine($"⚠ Check: Employee {employeeId} not found");
                    return Ok(new { available = false });
                }

                // Check availability using Access structure (EmployeeId + ShiftId)
                var availability = await _db.Availabilities
                    .FirstOrDefaultAsync(a => 
                        a.EmployeeId == employee.EmployeeId &&
                        a.ShiftId == shiftId);

                var isAvailable = availability != null && availability.IsAvailable;
                Console.WriteLine($"Check availability - EmployeeId: {employeeId}, ShiftId: {shiftId}, Available: {isAvailable}");
                
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

    public class ToggleShiftAvailabilityDto
    {
        public int EmployeeId { get; set; }
        public int ShiftId { get; set; }
    }
}


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
                        EmployeeName = a.Employee != null ? $"{a.Employee.FirstName} {a.Employee.LastName}" : null,
                        a.DayOfWeek,
                        a.StartTime,
                        a.EndTime
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
                    EmployeeName = availability.Employee != null ? $"{availability.Employee.FirstName} {availability.Employee.LastName}" : null,
                    availability.DayOfWeek,
                    availability.StartTime,
                    availability.EndTime
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
                                    AvailabilityId AUTOINCREMENT PRIMARY KEY,
                                    EmployeeId INTEGER NOT NULL,
                                    DayOfWeek INTEGER NOT NULL,
                                    StartTime DOUBLE NOT NULL,
                                    EndTime DOUBLE NOT NULL
                                )
                            ");
                            Console.WriteLine("✓ Created Availabilities table");
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
                    DayOfWeek = dto.DayOfWeek,
                    StartTime = dto.StartTime,
                    EndTime = dto.EndTime
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
        // Toggle availability for a specific shift (creates or deletes availability based on shift time)
        [HttpPost("toggle")]
        public async Task<IActionResult> ToggleShiftAvailability([FromBody] ToggleShiftAvailabilityDto dto)
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
                                    AvailabilityId AUTOINCREMENT PRIMARY KEY,
                                    EmployeeId INTEGER NOT NULL,
                                    DayOfWeek INTEGER NOT NULL,
                                    StartTime DOUBLE NOT NULL,
                                    EndTime DOUBLE NOT NULL
                                )
                            ");
                            Console.WriteLine("✓ Created Availabilities table");
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

                // Get the shift to extract day and time
                var shift = await _db.Shifts.FindAsync(dto.ShiftId);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                // Find employee by user email (since dto.EmployeeId is actually userId)
                var user = await _db.Users.FindAsync(dto.EmployeeId);
                if (user == null)
                {
                    return NotFound(new { error = "User not found" });
                }

                // Find employee by matching name and store
                var nameParts = user.FullName.Trim().Split(' ', 2);
                var firstName = nameParts[0];
                var lastName = nameParts.Length > 1 ? nameParts[1] : "";

                var employee = await _db.Employees
                    .FirstOrDefaultAsync(e => 
                        e.FirstName == firstName && 
                        (string.IsNullOrEmpty(lastName) || e.LastName == lastName) &&
                        e.StoreId == user.StoreId);

                if (employee == null)
                {
                    return NotFound(new { error = "Employee record not found for this user. Please contact administrator." });
                }

                var shiftDay = shift.StartTime.DayOfWeek;
                var shiftStartTime = shift.StartTime.TimeOfDay;
                var shiftEndTime = shift.EndTime.TimeOfDay;

                // Check if availability already exists for this shift
                var existingAvailability = await _db.Availabilities
                    .FirstOrDefaultAsync(a => 
                        a.EmployeeId == employee.EmployeeId &&
                        a.DayOfWeek == shiftDay &&
                        a.StartTime == shiftStartTime &&
                        a.EndTime == shiftEndTime);

                if (existingAvailability != null)
                {
                    // Delete existing availability (toggle off)
                    _db.Availabilities.Remove(existingAvailability);
                    await _db.SaveChangesAsync();
                    return Ok(new { available = false, message = "Availability removed" });
                }
                else
                {
                    // Create new availability (toggle on)
                    var availability = new Availability
                    {
                        EmployeeId = employee.EmployeeId,
                        DayOfWeek = shiftDay,
                        StartTime = shiftStartTime,
                        EndTime = shiftEndTime
                    };

                    _db.Availabilities.Add(availability);
                    await _db.SaveChangesAsync();
                    return Ok(new { available = true, message = "Availability added", availabilityId = availability.AvailabilityId });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to toggle availability", message = ex.Message });
            }
        }

        // GET: api/Availabilities/check/{userId}/{shiftId}
        // Check if employee (by userId) is available for a specific shift
        [HttpGet("check/{userId}/{shiftId}")]
        public async Task<ActionResult<object>> CheckShiftAvailability(int userId, int shiftId)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(shiftId);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                // Find user and corresponding employee
                var user = await _db.Users.FindAsync(userId);
                if (user == null)
                {
                    return NotFound(new { error = "User not found" });
                }

                var nameParts = user.FullName.Trim().Split(' ', 2);
                var firstName = nameParts[0];
                var lastName = nameParts.Length > 1 ? nameParts[1] : "";

                var employee = await _db.Employees
                    .FirstOrDefaultAsync(e => 
                        e.FirstName == firstName && 
                        (string.IsNullOrEmpty(lastName) || e.LastName == lastName) &&
                        e.StoreId == user.StoreId);

                if (employee == null)
                {
                    return Ok(new { available = false });
                }

                var shiftDay = shift.StartTime.DayOfWeek;
                var shiftStartTime = shift.StartTime.TimeOfDay;
                var shiftEndTime = shift.EndTime.TimeOfDay;

                var availability = await _db.Availabilities
                    .FirstOrDefaultAsync(a => 
                        a.EmployeeId == employee.EmployeeId &&
                        a.DayOfWeek == shiftDay &&
                        a.StartTime == shiftStartTime &&
                        a.EndTime == shiftEndTime);

                return Ok(new { available = availability != null });
            }
            catch (Exception ex)
            {
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
                availability.DayOfWeek = dto.DayOfWeek;
                availability.StartTime = dto.StartTime;
                availability.EndTime = dto.EndTime;

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
        public DayOfWeek DayOfWeek { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
    }

    public class UpdateAvailabilityDto
    {
        public int EmployeeId { get; set; }
        public DayOfWeek DayOfWeek { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
    }

    public class ToggleShiftAvailabilityDto
    {
        public int EmployeeId { get; set; }
        public int ShiftId { get; set; }
    }
}


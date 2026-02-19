using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ShiftsController : ControllerBase
    {
        private readonly AppData _db;

        public ShiftsController(AppData db)
        {
            _db = db;
        }

        // GET: api/Shifts
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetShifts([FromQuery] int? storeId = null, [FromQuery] DateTime? weekStart = null)
        {
            try
            {
                // Ensure Shifts table exists
                try
                {
                    var testCount = await _db.Shifts.CountAsync();
                }
                catch (Exception tableEx)
                {
                    if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist"))
                    {
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync(@"
                                CREATE TABLE Shifts (
                                    ShiftId AUTOINCREMENT PRIMARY KEY,
                                    StoreId INTEGER NOT NULL,
                                    StartTime DATETIME NOT NULL,
                                    EndTime DATETIME NOT NULL,
                                    RequiredProductivity DECIMAL(18,2) NOT NULL,
                                    EmployeeId INTEGER,
                                    MatchScore DOUBLE
                                )
                            ");
                            Console.WriteLine("✓ Created Shifts table");
                        }
                        catch (Exception createEx)
                        {
                            return StatusCode(500, new 
                            { 
                                error = "Database setup error", 
                                message = $"Could not create Shifts table: {createEx.Message}" 
                            });
                        }
                    }
                }

                var query = _db.Shifts
                    .Include(s => s.Store)
                    .Include(s => s.Employee)
                    .AsQueryable();

                // Filter by store if provided
                if (storeId.HasValue)
                {
                    query = query.Where(s => s.StoreId == storeId.Value);
                }

                // Filter by week if provided
                if (weekStart.HasValue)
                {
                    var weekEnd = weekStart.Value.AddDays(7);
                    query = query.Where(s => s.StartTime >= weekStart.Value && s.StartTime < weekEnd);
                }

                var shifts = await query
                    .Select(s => new
                    {
                        s.ShiftId,
                        s.StoreId,
                        StoreName = s.Store != null ? s.Store.Name : null,
                        s.StartTime,
                        s.EndTime,
                        s.RequiredProductivity,
                        s.EmployeeId,
                        EmployeeName = s.Employee != null ? $"{s.Employee.FirstName} {s.Employee.LastName}" : null,
                        s.MatchScore
                    })
                    .OrderBy(s => s.StartTime)
                    .ToListAsync();

                return Ok(shifts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve shifts", message = ex.Message });
            }
        }

        // GET: api/Shifts/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetShift(int id)
        {
            try
            {
                var shift = await _db.Shifts
                    .Include(s => s.Store)
                    .Include(s => s.Employee)
                    .FirstOrDefaultAsync(s => s.ShiftId == id);

                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                return Ok(new
                {
                    shift.ShiftId,
                    shift.StoreId,
                    StoreName = shift.Store?.Name,
                    shift.StartTime,
                    shift.EndTime,
                    shift.RequiredProductivity,
                    shift.EmployeeId,
                    EmployeeName = shift.Employee != null ? $"{shift.Employee.FirstName} {shift.Employee.LastName}" : null,
                    shift.MatchScore
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve shift", message = ex.Message });
            }
        }

        // POST: api/Shifts
        [HttpPost]
        [Authorize(Roles = "Manager")]
        public async Task<ActionResult<Shift>> CreateShift([FromBody] CreateShiftDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var shift = new Shift
                {
                    StoreId = dto.StoreId,
                    StartTime = dto.StartTime,
                    EndTime = dto.EndTime,
                    RequiredProductivity = dto.RequiredProductivity,
                    EmployeeId = dto.EmployeeId,
                    MatchScore = dto.MatchScore
                };

                _db.Shifts.Add(shift);
                await _db.SaveChangesAsync();

                return CreatedAtAction(nameof(GetShift), new { id = shift.ShiftId }, shift);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to create shift", message = ex.Message });
            }
        }

        // PUT: api/Shifts/5
        [HttpPut("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> UpdateShift(int id, [FromBody] UpdateShiftDto dto)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(id);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                shift.StoreId = dto.StoreId;
                shift.StartTime = dto.StartTime;
                shift.EndTime = dto.EndTime;
                shift.RequiredProductivity = dto.RequiredProductivity;
                shift.EmployeeId = dto.EmployeeId;
                shift.MatchScore = dto.MatchScore;

                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to update shift", message = ex.Message });
            }
        }

        // DELETE: api/Shifts/5
        [HttpDelete("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> DeleteShift(int id)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(id);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                _db.Shifts.Remove(shift);
                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to delete shift", message = ex.Message });
            }
        }

        // POST: api/Shifts/5/assign
        [HttpPost("{id}/assign")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> AssignEmployee(int id, [FromBody] AssignEmployeeDto dto)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(id);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                if (dto.EmployeeId.HasValue)
                {
                    var employee = await _db.Employees.FindAsync(dto.EmployeeId.Value);
                    if (employee == null)
                    {
                        return NotFound(new { error = "Employee not found" });
                    }
                }

                shift.EmployeeId = dto.EmployeeId;
                shift.MatchScore = dto.MatchScore;

                await _db.SaveChangesAsync();

                return Ok(new { message = "Employee assigned successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to assign employee", message = ex.Message });
            }
        }
    }

    public class CreateShiftDto
    {
        public int StoreId { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public decimal RequiredProductivity { get; set; }
        public int? EmployeeId { get; set; }
        public double? MatchScore { get; set; }
    }

    public class UpdateShiftDto
    {
        public int StoreId { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public decimal RequiredProductivity { get; set; }
        public int? EmployeeId { get; set; }
        public double? MatchScore { get; set; }
    }

    public class AssignEmployeeDto
    {
        public int? EmployeeId { get; set; }
        public double? MatchScore { get; set; }
    }
}


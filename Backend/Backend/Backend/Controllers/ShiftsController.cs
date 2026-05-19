// =============================================================================
// ShiftsController.cs — المناوبات والتعيين
// =============================================================================
// GET /api/shifts — 14 مناوبة للأسبوع (لوحة المدير).
// GET for-employee — مناوبات عامل معيّنة (جدول العامل).
// POST {id}/assign — المدير يعيّن عاملاً لمناوبة (بعد السحب والإفلات).
// =============================================================================

using Backend.Models;
using Backend.Services;
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
        private readonly IConfiguration _config;

        public ShiftsController(AppData db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        private string ConnectionString =>
            _config.GetConnectionString("ShiftlyConnection")
            ?? "Data Source=C:\\Users\\aleen\\Documents\\ShiftlyDB.accdb";

        /// <summary>جلب مناوبات الأسبوع — يُستدعى من صفحة جدولة المدير.</summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetShifts([FromQuery] DateTime? weekStart = null)
        {
            try
            {
                await EnsureShiftsTableExistsAsync();

                var weekStartDate = ShiftBootstrap.GetWeekStart(weekStart);
                var weekEnd = weekStartDate.AddDays(7);

                var count = await _db.Shifts
                    .Where(s => s.StartTime >= weekStartDate && s.StartTime < weekEnd)
                    .CountAsync();

                if (count != 14)
                    await ShiftBootstrap.ResetAndSeedCurrentWeekAsync(_db, ConnectionString, forceReset: false);

                var shifts = await _db.Shifts
                    .Where(s => s.StartTime >= weekStartDate && s.StartTime < weekEnd
                        && s.SlotNumber >= 1 && s.SlotNumber <= 14)
                    .Select(s => new
                    {
                        s.ShiftId,
                        SlotNumber = s.SlotNumber ?? 0,
                        s.StartTime,
                        s.EndTime,
                        s.RequiredProductivity,
                        s.EmployeeId,
                        EmployeeName = s.EmployeeId != null
                            ? _db.Employees.Where(e => e.EmployeeId == s.EmployeeId).Select(e => e.FirstName).FirstOrDefault()
                            : null
                    })
                    .OrderBy(s => s.SlotNumber)
                    .ToListAsync();

                return Ok(shifts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve shifts", message = ex.Message });
            }
        }

        [HttpGet("my-shifts")]
        [Authorize]
        public async Task<ActionResult<IEnumerable<object>>> GetMyShifts()
        {
            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int employeeId))
                return Unauthorized(new { error = "Not authenticated" });

            var isEmployee = User.IsInRole("Employee") || User.FindFirst("UserType")?.Value == "Employee";
            if (!isEmployee)
                return BadRequest(new { error = "This endpoint is for workers only" });

            return await GetShiftsForEmployeeInternal(employeeId, null);
        }

        [HttpGet("for-employee")]
        [Authorize]
        public async Task<ActionResult<IEnumerable<object>>> GetShiftsForEmployee([FromQuery] int employeeId)
        {
            if (employeeId <= 0)
                return BadRequest(new { error = "employeeId is required" });

            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int authenticatedUserId))
                return Unauthorized(new { error = "Not authenticated" });

            var isManager = User.IsInRole("Manager") || User.FindFirst("UserType")?.Value == "Manager";
            var isEmployee = User.IsInRole("Employee") || User.FindFirst("UserType")?.Value == "Employee";

            if (await _db.Employees.FindAsync(employeeId) == null)
                return NotFound(new { error = "Employee not found" });

            if (isEmployee && !isManager && authenticatedUserId != employeeId)
                return Forbid();

            return await GetShiftsForEmployeeInternal(employeeId, null);
        }

        private async Task<ActionResult<IEnumerable<object>>> GetShiftsForEmployeeInternal(int employeeId, DateTime? weekStart)
        {
            var weekStartDate = ShiftBootstrap.GetWeekStart(weekStart);
            var weekEnd = weekStartDate.AddDays(7);

            var shifts = await _db.Shifts
                .Where(s => s.EmployeeId == employeeId && s.StartTime >= weekStartDate && s.StartTime < weekEnd)
                .OrderBy(s => s.SlotNumber ?? 0)
                .Select(s => new
                {
                    s.ShiftId,
                    SlotNumber = s.SlotNumber ?? 0,
                    s.StartTime,
                    s.EndTime,
                    s.RequiredProductivity,
                    EmployeeId = s.EmployeeId
                })
                .ToListAsync();

            return Ok(shifts);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetShift(int id)
        {
            var shift = await _db.Shifts.FirstOrDefaultAsync(s => s.ShiftId == id);
            if (shift == null)
                return NotFound(new { error = "Shift not found" });

            string? employeeName = null;
            if (shift.EmployeeId.HasValue)
            {
                employeeName = await _db.Employees
                    .Where(e => e.EmployeeId == shift.EmployeeId.Value)
                    .Select(e => e.FirstName)
                    .FirstOrDefaultAsync();
            }

            return Ok(new
            {
                shift.ShiftId,
                shift.StartTime,
                shift.EndTime,
                shift.RequiredProductivity,
                shift.EmployeeId,
                EmployeeName = employeeName
            });
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> UpdateShift(int id, [FromBody] UpdateShiftDto dto)
        {
            var shift = await _db.Shifts.FindAsync(id);
            if (shift == null)
                return NotFound(new { error = "Shift not found" });

            shift.StartTime = dto.StartTime;
            shift.EndTime = dto.EndTime;
            shift.RequiredProductivity = dto.RequiredProductivity;
            shift.EmployeeId = dto.EmployeeId;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpPost("cleanup")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> CleanupShifts()
        {
            await ShiftBootstrap.ResetAndSeedCurrentWeekAsync(_db, ConnectionString, forceReset: true);
            return Ok(new { message = "Shifts reset: 14 slots created for the current week (IDs from 1 when database was empty)." });
        }

        [HttpPost("reinitialize")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> ReinitializeShifts()
        {
            await ShiftBootstrap.ResetAndSeedCurrentWeekAsync(_db, ConnectionString, forceReset: true);
            return Ok(new { message = "Shifts reinitialized for the current week." });
        }

        [HttpPost("seed")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> SeedShifts()
        {
            await ShiftBootstrap.ResetAndSeedCurrentWeekAsync(_db, ConnectionString, forceReset: false);
            return Ok(new { message = "Shifts seeded for the current week (14 slots)." });
        }

        [HttpPost("{id}/assign")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> AssignEmployee(int id, [FromBody] AssignEmployeeDto dto)
        {
            var shift = await _db.Shifts.FindAsync(id);
            if (shift == null)
                return NotFound(new { error = "Shift not found" });

            if (dto.EmployeeId.HasValue)
            {
                var employee = await _db.Employees.FindAsync(dto.EmployeeId.Value);
                if (employee == null)
                    return NotFound(new { error = "Employee not found" });

                var invalidRecords = await _db.Availabilities
                    .Where(a => a.EmployeeId == employee.EmployeeId && a.ShiftId <= 0)
                    .ToListAsync();
                if (invalidRecords.Count > 0)
                {
                    _db.Availabilities.RemoveRange(invalidRecords);
                    await _db.SaveChangesAsync();
                }

                var shiftSlotNumber = shift.SlotNumber ?? 0;
                if (shiftSlotNumber < 1 || shiftSlotNumber > 14)
                    return BadRequest(new { error = "Invalid shift", message = "This shift has no slot number (1-14). Refresh the schedule." });

                var availabilityCheck = await _db.Availabilities
                    .Where(a => a.EmployeeId == employee.EmployeeId && a.IsAvailable)
                    .Join(_db.Shifts.Where(s => s.SlotNumber >= 1 && s.SlotNumber <= 14),
                        a => a.ShiftId, s => s.ShiftId, (a, s) => new { a, s.SlotNumber })
                    .Where(x => x.SlotNumber == shiftSlotNumber)
                    .Select(x => x.a)
                    .FirstOrDefaultAsync();

                if (availabilityCheck == null)
                {
                    return BadRequest(new
                    {
                        error = "Employee not available",
                        message = "This employee has not marked themselves available for this shift slot."
                    });
                }
            }

            shift.EmployeeId = dto.EmployeeId;
            await _db.SaveChangesAsync();
            return Ok(new { message = "Employee assigned successfully" });
        }

        private async Task EnsureShiftsTableExistsAsync()
        {
            try
            {
                await _db.Shifts.CountAsync();
            }
            catch (Exception ex) when (ex.Message.Contains("cannot find") || ex.Message.Contains("does not exist"))
            {
                await _db.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE Shifts (
                        Shift_ID AUTOINCREMENT PRIMARY KEY,
                        Shift_StartTime DATETIME NOT NULL,
                        Shift_EndTime DATETIME NOT NULL,
                        Shift_ReqThroughput DECIMAL(18,2),
                        Shift_EmployeeID INTEGER,
                        Shift_SlotNumber INTEGER
                    )");
            }
        }
    }

    public class UpdateShiftDto
    {
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public decimal RequiredProductivity { get; set; }
        public int? EmployeeId { get; set; }
    }

    public class AssignEmployeeDto
    {
        public int? EmployeeId { get; set; }
    }
}

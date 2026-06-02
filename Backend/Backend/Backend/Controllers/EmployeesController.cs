// =============================================================================
// EmployeesController.cs — إدارة العمال (للمدير)
// =============================================================================
// GET — قائمة كل العمال (للشريط الجانبي والسحب).
// POST/PUT/DELETE — إضافة وتعديل وحذف (صفحة Employee Management).
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
    public class EmployeesController : ControllerBase
    {
        private readonly AppData _db;
        private readonly AccessEmployeeStore _employees;

        public EmployeesController(AppData db, AccessEmployeeStore employees)
        {
            _db = db;
            _employees = employees;
        }

        [HttpGet]
        public ActionResult<IEnumerable<object>> GetEmployees()
        {
            try
            {
                _employees.EnsureDatabaseReady();
                var fromOle = _employees.ListAll().Select(r => new
                {
                    EmployeeId = (int)r["EmployeeId"]!,
                    FirstName = (string?)r["FirstName"] ?? "",
                    HourlyWage = (decimal)r["HourlyWage"]!,
                    ProductivityScore = (double)r["ProductivityScore"]!,
                    Email = (string?)r["Email"],
                    FullName = (string?)r["FirstName"] ?? ""
                });
                return Ok(fromOle);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve employees", message = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetEmployee(int id)
        {
            var employee = await _db.Employees
                .Include(e => e.Availabilities)
                .FirstOrDefaultAsync(e => e.EmployeeId == id);
            if (employee == null) return NotFound(new { error = "Employee not found" });

            return Ok(new
            {
                employee.EmployeeId,
                employee.FirstName,
                employee.HourlyWage,
                employee.ProductivityScore,
                employee.Email,
                FullName = employee.FirstName,
                Availabilities = employee.Availabilities.Select(a => new
                {
                    a.AvailabilityId,
                    a.ShiftId,
                    a.IsAvailable
                })
            });
        }

        [HttpPost]
        [Authorize(Roles = "Manager")]
        public ActionResult<object> CreateEmployee([FromBody] CreateEmployeeDto dto)
        {
            if (dto == null) return BadRequest(new { error = "Request body is required" });
            if (string.IsNullOrWhiteSpace(dto.FirstName))
                return BadRequest(new { error = "First name is required" });

            try
            {
                var id = _employees.CreateManagerEmployee(
                    dto.FirstName.Trim(), dto.HourlyWage, dto.ProductivityScore, dto.Email);
                return CreatedAtAction(nameof(GetEmployee), new { id }, new
                {
                    EmployeeId = id,
                    dto.FirstName,
                    dto.HourlyWage,
                    dto.ProductivityScore,
                    dto.Email,
                    databasePath = _employees.FilePath
                });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { error = ex.Message, databasePath = _employees.FilePath });
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Manager")]
        public IActionResult UpdateEmployee(int id, [FromBody] UpdateEmployeeDto dto)
        {
            if (!_employees.Update(id, dto.FirstName.Trim(), dto.HourlyWage, dto.ProductivityScore, dto.Email))
                return NotFound(new { error = "Employee not found or database locked" });
            return NoContent();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Manager")]
        public IActionResult DeleteEmployee(int id)
        {
            if (!_employees.Delete(id))
                return NotFound(new { error = "Employee not found or database locked" });
            return NoContent();
        }
    }

    public class CreateEmployeeDto
    {
        public string FirstName { get; set; } = string.Empty;
        public decimal HourlyWage { get; set; }
        public double ProductivityScore { get; set; }
        public string? Email { get; set; }
    }

    public class UpdateEmployeeDto
    {
        public string FirstName { get; set; } = string.Empty;
        public decimal HourlyWage { get; set; }
        public double ProductivityScore { get; set; }
        public string? Email { get; set; }
    }
}

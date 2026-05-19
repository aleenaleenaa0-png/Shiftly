using Backend.Models;
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

        public EmployeesController(AppData db) => _db = db;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetEmployees()
        {
            try
            {
                var employees = await _db.Employees
                    .Select(e => new
                    {
                        e.EmployeeId,
                        e.FirstName,
                        e.HourlyWage,
                        e.ProductivityScore,
                        e.Email,
                        FullName = e.FirstName
                    })
                    .ToListAsync();
                return Ok(employees);
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
        public async Task<ActionResult<object>> CreateEmployee([FromBody] CreateEmployeeDto dto)
        {
            if (dto == null) return BadRequest(new { error = "Request body is required" });
            if (string.IsNullOrWhiteSpace(dto.FirstName))
                return BadRequest(new { error = "First name is required" });

            var employee = new Employee
            {
                FirstName = dto.FirstName.Trim(),
                HourlyWage = dto.HourlyWage,
                ProductivityScore = dto.ProductivityScore,
                Email = dto.Email?.Trim()
            };
            _db.Employees.Add(employee);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetEmployee), new { id = employee.EmployeeId }, new
            {
                employee.EmployeeId,
                employee.FirstName,
                employee.HourlyWage,
                employee.ProductivityScore,
                employee.Email
            });
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> UpdateEmployee(int id, [FromBody] UpdateEmployeeDto dto)
        {
            var employee = await _db.Employees.FindAsync(id);
            if (employee == null) return NotFound(new { error = "Employee not found" });

            employee.FirstName = dto.FirstName.Trim();
            employee.HourlyWage = dto.HourlyWage;
            employee.ProductivityScore = dto.ProductivityScore;
            if (dto.Email != null) employee.Email = dto.Email.Trim();

            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> DeleteEmployee(int id)
        {
            var employee = await _db.Employees.FindAsync(id);
            if (employee == null) return NotFound(new { error = "Employee not found" });
            _db.Employees.Remove(employee);
            await _db.SaveChangesAsync();
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

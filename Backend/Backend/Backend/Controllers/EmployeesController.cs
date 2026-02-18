using Backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class EmployeesController : ControllerBase
    {
        private readonly AppData _db;

        public EmployeesController(AppData db)
        {
            _db = db;
        }

        // GET: api/Employees
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetEmployees()
        {
            try
            {
                // Ensure Employees table exists with correct schema
                bool employeesTableNeedsRecreation = false;
                try
                {
                    // Try to query with all expected columns
                    var testEmployee = await _db.Employees
                        .Select(e => new { e.EmployeeId, e.FirstName, e.LastName, e.HourlyWage, e.ProductivityScore, e.StoreId })
                        .FirstOrDefaultAsync();
                    Console.WriteLine("✓ Employees table exists with correct schema");
                }
                catch (Exception tableEx)
                {
                    if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist"))
                    {
                        Console.WriteLine("⚠ Employees table doesn't exist. Will create it.");
                        employeesTableNeedsRecreation = true;
                    }
                    else if (tableEx.Message.Contains("unknown field name") || 
                             tableEx.Message.Contains("required parameters") ||
                             tableEx.Message.Contains("FirstName") ||
                             tableEx.Message.Contains("ProductivityScore"))
                    {
                        Console.WriteLine("⚠ Employees table has wrong schema. Will recreate it.");
                        employeesTableNeedsRecreation = true;
                    }
                    else
                    {
                        Console.WriteLine($"⚠ Employees table check error: {tableEx.Message}");
                        employeesTableNeedsRecreation = true; // Better safe than sorry
                    }
                }

                // Recreate table if needed
                if (employeesTableNeedsRecreation)
                {
                    try
                    {
                        // Try to drop existing table first
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync("DROP TABLE Employees");
                            Console.WriteLine("✓ Dropped old Employees table");
                        }
                        catch (Exception dropEx)
                        {
                            Console.WriteLine($"⚠ Could not drop table (might not exist): {dropEx.Message}");
                        }

                        // Create Employees table with correct schema (same syntax as Stores/Users)
                        await _db.Database.ExecuteSqlRawAsync(@"
                            CREATE TABLE Employees (
                                EmployeeId AUTOINCREMENT PRIMARY KEY,
                                FirstName TEXT(50) NOT NULL,
                                LastName TEXT(50) NOT NULL,
                                HourlyWage DECIMAL(18,2) NOT NULL,
                                ProductivityScore DOUBLE NOT NULL,

                                StoreId INTEGER NOT NULL,
                                Email TEXT(200),
                                Password TEXT(200)
                            )
                        ");
                        Console.WriteLine("✓ Created Employees table with correct schema");
                        
                        // Verify table was created
                        try
                        {
                            var verify = await _db.Employees.CountAsync();
                            Console.WriteLine($"✓ Employees table verified (has {verify} records)");
                        }
                        catch (Exception verifyEx)
                        {
                            Console.WriteLine($"⚠ Could not verify Employees table: {verifyEx.Message}");
                        }
                    }
                    catch (Exception createEx)
                    {
                        Console.WriteLine($"⚠ Error creating Employees table: {createEx.Message}");
                        return StatusCode(500, new 
                        { 
                            error = "Database setup error", 
                            message = $"Could not create Employees table: {createEx.Message}",
                            details = createEx.InnerException?.Message
                        });
                    }
                }

                // Get employees - use left join to handle cases where Store might not exist
                var employees = await _db.Employees
                    .Select(e => new
                    {
                        e.EmployeeId,
                        e.FirstName,
                        e.LastName,
                        e.HourlyWage,
                        e.ProductivityScore,
                        e.StoreId,
                        StoreName = e.Store != null ? e.Store.Name : null,
                        FullName = $"{e.FirstName} {e.LastName}"
                    })
                    .ToListAsync();

                return Ok(employees);
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { 
                        error = "Database is locked", 
                        message = "The database is currently open in Microsoft Access or another application. Please close it and try again." 
                    });
                }
                
                // Log detailed error
                Console.WriteLine($"GetEmployees error: {ex.Message}");
                Console.WriteLine($"Inner exception: {ex.InnerException?.Message}");
                
                return StatusCode(500, new 
                { 
                    error = "Failed to retrieve employees", 
                    message = ex.Message,
                    details = ex.InnerException?.Message
                });
            }
        }

        // GET: api/Employees/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetEmployee(int id)
        {
            try
            {
                var employee = await _db.Employees
                    .Include(e => e.Store)
                    .Include(e => e.Availabilities)
                    .FirstOrDefaultAsync(e => e.EmployeeId == id);

                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                return Ok(new
                {
                    employee.EmployeeId,
                    employee.FirstName,
                    employee.LastName,
                    employee.HourlyWage,
                    employee.ProductivityScore,
                    employee.StoreId,
                    StoreName = employee.Store?.Name,
                    FullName = $"{employee.FirstName} {employee.LastName}",
                    Availabilities = employee.Availabilities.Select(a => new
                    {
                        a.AvailabilityId,
                        a.DayOfWeek,
                        a.StartTime,
                        a.EndTime
                    })
                });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { 
                        error = "Database is locked", 
                        message = "The database is currently open in Microsoft Access or another application. Please close it and try again." 
                    });
                }
                return StatusCode(500, new { error = "Failed to retrieve employee", message = ex.Message });
            }
        }

        // POST: api/Employees
        [HttpPost]
        public async Task<ActionResult<Employee>> CreateEmployee([FromBody] CreateEmployeeDto dto)
        {
            try
            {
                // Log received data for debugging
                Console.WriteLine($"CreateEmployee received - FirstName: {dto?.FirstName}, LastName: {dto?.LastName}, StoreId: {dto?.StoreId}");

                if (dto == null)
                {
                    return BadRequest(new { error = "Request body is required" });
                }

                // Validate required fields
                if (string.IsNullOrWhiteSpace(dto.FirstName) || string.IsNullOrWhiteSpace(dto.LastName))
                {
                    return BadRequest(new { error = "First name and last name are required" });
                }

                if (dto.StoreId <= 0)
                {
                    return BadRequest(new { error = "Please select a valid store" });
                }

                // Ensure Employees table exists with correct schema (same check as GetEmployees)
                // We'll let GetEmployees handle table creation, just verify it exists here
                try
                {
                    var testCount = await _db.Employees.CountAsync();
                }
                catch (Exception tableEx)
                {
                    if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist") ||
                        tableEx.Message.Contains("required parameters") || tableEx.Message.Contains("unknown field name"))
                    {
                        // Table doesn't exist or has wrong schema - return error
                        // The user should refresh the page to trigger GetEmployees which will create the table
                        return StatusCode(500, new 
                        { 
                            error = "Database setup error", 
                            message = "Employees table does not exist or has wrong schema. Please refresh the page to create it." 
                        });
                    }
                    throw; // Re-throw other errors
                }

                // Verify store exists
                var store = await _db.Stores.FindAsync(dto.StoreId);
                if (store == null)
                {
                    return BadRequest(new { error = $"Invalid store ID: {dto.StoreId}" });
                }

                var employee = new Employee
                {
                    FirstName = dto.FirstName.Trim(),
                    LastName = dto.LastName.Trim(),
                    HourlyWage = dto.HourlyWage,
                    ProductivityScore = dto.ProductivityScore,
                    StoreId = dto.StoreId
                };

                Console.WriteLine($"Creating employee - FirstName: {employee.FirstName}, LastName: {employee.LastName}, StoreId: {employee.StoreId}");

                _db.Employees.Add(employee);
                await _db.SaveChangesAsync();

                Console.WriteLine($"Employee created successfully with ID: {employee.EmployeeId}");

                return CreatedAtAction(nameof(GetEmployee), new { id = employee.EmployeeId }, new
                {
                    employee.EmployeeId,
                    employee.FirstName,
                    employee.LastName,
                    employee.HourlyWage,
                    employee.ProductivityScore,
                    employee.StoreId
                });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { 
                        error = "Database is locked", 
                        message = "The database is currently open in Microsoft Access or another application. Please close it and try again." 
                    });
                }
                
                // Log detailed error
                Console.WriteLine($"CreateEmployee error: {ex.Message}");
                Console.WriteLine($"Inner exception: {ex.InnerException?.Message}");
                
                return StatusCode(500, new 
                { 
                    error = "Failed to create employee", 
                    message = ex.Message,
                    details = ex.InnerException?.Message
                });
            }
        }

        // PUT: api/Employees/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateEmployee(int id, [FromBody] UpdateEmployeeDto dto)
        {
            try
            {
                var employee = await _db.Employees.FindAsync(id);
                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                employee.FirstName = dto.FirstName;
                employee.LastName = dto.LastName;
                employee.HourlyWage = dto.HourlyWage;
                employee.ProductivityScore = dto.ProductivityScore;
                employee.StoreId = dto.StoreId;

                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { 
                        error = "Database is locked", 
                        message = "The database is currently open in Microsoft Access or another application. Please close it and try again." 
                    });
                }
                return StatusCode(500, new { error = "Failed to update employee", message = ex.Message });
            }
        }

        // DELETE: api/Employees/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteEmployee(int id)
        {
            try
            {
                var employee = await _db.Employees.FindAsync(id);
                if (employee == null)
                {
                    return NotFound(new { error = "Employee not found" });
                }

                _db.Employees.Remove(employee);
                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { 
                        error = "Database is locked", 
                        message = "The database is currently open in Microsoft Access or another application. Please close it and try again." 
                    });
                }
                return StatusCode(500, new { error = "Failed to delete employee", message = ex.Message });
            }
        }
    }

    public class CreateEmployeeDto
    {
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public decimal HourlyWage { get; set; }
        public double ProductivityScore { get; set; }
        public int StoreId { get; set; }
    }

    public class UpdateEmployeeDto
    {
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public decimal HourlyWage { get; set; }
        public double ProductivityScore { get; set; }
        public int StoreId { get; set; }
    }
}


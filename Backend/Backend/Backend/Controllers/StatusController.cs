using Backend.Models;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StatusController : ControllerBase
    {
        private readonly AppData _db;

        public StatusController(AppData db)
        {
            _db = db;
        }

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            try
            {
                // Test database connection
                var canConnect = await _db.Database.CanConnectAsync();
                if (!canConnect)
                {
                    return Ok(new 
                    { 
                        status = "disconnected",
                        message = "Database file not found or cannot be accessed. Please check the connection string.",
                        stores = 0,
                        users = 0,
                        employees = 0,
                        shifts = 0,
                        availabilities = 0
                    });
                }

                var result = new
                {
                    status = "connected",
                    message = "Database connection successful",
                    stores = _db.Stores.Count(),
                    users = _db.Users.Count(),
                    employees = _db.Employees.Count(),
                    shifts = _db.Shifts.Count(),
                    availabilities = _db.Availabilities.Count()
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                // If the database is not reachable, still return a simple status.
                string status = "error";
                string message = ex.Message;
                
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    status = "locked";
                    message = "Database is locked. Please close Microsoft Access if it's open and try again.";
                }
                
                return Ok(new 
                { 
                    status = status,
                    message = message,
                    stores = 0,
                    users = 0,
                    employees = 0,
                    shifts = 0,
                    availabilities = 0
                });
            }
        }
    }
}



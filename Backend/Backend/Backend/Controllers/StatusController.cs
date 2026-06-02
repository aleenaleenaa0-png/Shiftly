// =============================================================================
// StatusController.cs — فحص اتصال السيرفر وقاعدة البيانات
// =============================================================================

using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StatusController : ControllerBase
    {
        private readonly AppData _db;
        private readonly AccessEmployeeStore _employees;

        public StatusController(AppData db, AccessEmployeeStore employees)
        {
            _db = db;
            _employees = employees;
        }

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            string databasePath;
            try
            {
                _employees.EnsureDatabaseReady();
                databasePath = _employees.FilePath;
            }
            catch (Exception pathEx)
            {
                return Ok(new
                {
                    status = "error",
                    message = pathEx.Message,
                    databasePath = (string?)null,
                    users = 0,
                    employees = 0,
                    shifts = 0,
                    availabilities = 0
                });
            }

            try
            {
                var employeeCount = _employees.Count();

                int users = 0, shifts = 0, availabilities = 0;
                try
                {
                    if (await _db.Database.CanConnectAsync())
                    {
                        users = await _db.Users.CountAsync();
                        shifts = await _db.Shifts.CountAsync();
                        availabilities = await _db.Availabilities.CountAsync();
                    }
                }
                catch
                {
                    // EF may fail on #Dual; employee list from OleDb is authoritative
                }

                return Ok(new
                {
                    status = "connected",
                    message = "Database connection successful",
                    databasePath,
                    users,
                    employees = employeeCount,
                    shifts,
                    availabilities
                });
            }
            catch (Exception ex)
            {
                return Ok(new
                {
                    status = "error",
                    message = ex.Message,
                    databasePath,
                    users = 0,
                    employees = 0,
                    shifts = 0,
                    availabilities = 0
                });
            }
        }
    }
}

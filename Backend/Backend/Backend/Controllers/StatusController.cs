// =============================================================================
// StatusController.cs — فحص اتصال السيرفر وقاعدة البيانات
// =============================================================================
// GET /api/status — يُعرض في الواجهة "Connected (Employees: X, Shifts: Y)".
// للمختبر: إن فشل الاتصال تحقق من تشغيل Backend وإغلاق Access.
// =============================================================================

using Backend.Models;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StatusController : ControllerBase
    {
        private readonly AppData _db;

        public StatusController(AppData db) => _db = db;

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            try
            {
                if (!await _db.Database.CanConnectAsync())
                {
                    return Ok(new
                    {
                        status = "disconnected",
                        message = "Database file not found or cannot be accessed.",
                        users = 0,
                        employees = 0,
                        shifts = 0,
                        availabilities = 0
                    });
                }

                return Ok(new
                {
                    status = "connected",
                    message = "Database connection successful",
                    users = _db.Users.Count(),
                    employees = _db.Employees.Count(),
                    shifts = _db.Shifts.Count(),
                    availabilities = _db.Availabilities.Count()
                });
            }
            catch (Exception ex)
            {
                return Ok(new
                {
                    status = "error",
                    message = ex.Message,
                    users = 0,
                    employees = 0,
                    shifts = 0,
                    availabilities = 0
                });
            }
        }
    }
}

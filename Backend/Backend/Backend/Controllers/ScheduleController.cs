using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    /// <summary>
    /// Schedule publish: when a manager "shares" the schedule, workers can see it on their schedule page.
    /// Published state is stored in-memory (keyed by storeId + weekStart).
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class ScheduleController : ControllerBase
    {
        private readonly AppData _db;
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime> PublishedSchedules = new();

        public ScheduleController(AppData db)
        {
            _db = db;
        }

        private static string Key(int storeId, DateTime weekStart)
        {
            return $"{storeId}_{weekStart:yyyy-MM-dd}";
        }

        /// <summary>
        /// Converts a DateTime (potentially UTC from ISO string) to local date, ensuring correct week calculation.
        /// ASP.NET Core may parse ISO strings as Unspecified, so we handle that case by treating it as UTC if needed.
        /// </summary>
        private static DateTime GetLocalDate(DateTime dateTime)
        {
            // If the DateTime is UTC (from ISO string), convert to local time first, then get date
            if (dateTime.Kind == DateTimeKind.Utc)
            {
                return dateTime.ToLocalTime().Date;
            }
            // If Unspecified, ASP.NET Core likely parsed an ISO string without timezone info
            // For week start dates sent from frontend, they're typically midnight UTC
            // We need to treat Unspecified as UTC to get the correct local date
            if (dateTime.Kind == DateTimeKind.Unspecified)
            {
                // Specify as UTC first, then convert to local
                var asUtc = DateTime.SpecifyKind(dateTime, DateTimeKind.Utc);
                return asUtc.ToLocalTime().Date;
            }
            // If already local, just get the date part
            return dateTime.Date;
        }

        /// <summary>
        /// POST api/schedule/publish - Mark the current week's schedule as published for this store.
        /// Workers see "Shared with you" on their schedule page. Requires Manager authorization and verifies manager manages the requested store.
        /// </summary>
        [HttpPost("publish")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> Publish([FromQuery] int storeId, [FromQuery] DateTime? weekStart = null)
        {
            if (storeId <= 0)
                return BadRequest(new { error = "Invalid storeId" });

            // Get authenticated manager's user ID
            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int managerUserId))
                return Unauthorized(new { error = "Not authenticated" });

            // Verify manager manages the requested store
            var managerUser = await _db.Users.FindAsync(managerUserId);
            if (managerUser == null)
                return Forbid("Manager account not found");
            if (managerUser.StoreId != storeId)
                return Forbid("You can only publish schedules for your own store");

            // Calculate week start date, handling UTC dates from frontend correctly
            DateTime weekStartDate;
            if (weekStart.HasValue)
            {
                // Convert UTC date to local date to ensure correct week calculation
                weekStartDate = GetLocalDate(weekStart.Value);
            }
            else
            {
                // Calculate current week start (Monday) in local time
                var today = DateTime.Today;
                var dayOfWeek = (int)today.DayOfWeek;
                weekStartDate = today.AddDays(dayOfWeek == 0 ? -6 : 1 - dayOfWeek).Date;
            }

            var key = Key(storeId, weekStartDate);
            PublishedSchedules[key] = DateTime.UtcNow;
            return Ok(new
            {
                message = "Schedule shared with workers. They can now see their shifts on their schedule page.",
                storeId,
                weekStart = weekStartDate.ToString("yyyy-MM-dd"),
                publishedAt = PublishedSchedules[key].ToString("o")
            });
        }

        /// <summary>
        /// GET api/schedule/publish/status - Check if the schedule for this store and week is published.
        /// Handles UTC dates from frontend correctly by converting to local date.
        /// </summary>
        [HttpGet("publish/status")]
        public IActionResult GetPublishStatus([FromQuery] int storeId, [FromQuery] DateTime weekStart)
        {
            // Convert UTC date to local date to ensure correct week calculation
            var weekStartDate = GetLocalDate(weekStart);
            var key = Key(storeId, weekStartDate);
            if (!PublishedSchedules.TryGetValue(key, out var publishedAt))
                return Ok(new { published = false, publishedAt = (string?)null });

            return Ok(new { published = true, publishedAt = publishedAt.ToString("o") });
        }
    }
}

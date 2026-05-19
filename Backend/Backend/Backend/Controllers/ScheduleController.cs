// =============================================================================
// ScheduleController.cs — نشر الجدول للعمال
// =============================================================================
// المدير يضغط "مشاركة الجدول" → POST publish
// العامل يسأل GET publish/status ليعرف هل يُعرض جدوله النهائي.
// ملاحظة: حالة النشر تُخزَّن في الذاكرة (تُفقد عند إعادة تشغيل السيرفر).
// للمختبر: بعد إعادة تشغيل Backend قد يحتاج المدير النشر مرة أخرى.
// =============================================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ScheduleController : ControllerBase
    {
        // مفتاح = بداية الأسبوع (yyyy-MM-dd)، قيمة = وقت النشر
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime> PublishedSchedules = new();

        private static string Key(DateTime weekStart) => weekStart.ToString("yyyy-MM-dd");

        private static DateTime GetLocalDate(DateTime dateTime)
        {
            if (dateTime.Kind == DateTimeKind.Utc)
                return dateTime.ToLocalTime().Date;
            if (dateTime.Kind == DateTimeKind.Unspecified)
                return DateTime.SpecifyKind(dateTime, DateTimeKind.Utc).ToLocalTime().Date;
            return dateTime.Date;
        }

        /// <summary>المدير ينشر الجدول — بعدها العمال يرون مناوباتهم المعيّنة.</summary>
        [HttpPost("publish")]
        [Authorize(Roles = "Manager")]
        public IActionResult Publish([FromQuery] DateTime? weekStart = null)
        {
            var weekStartDate = weekStart.HasValue
                ? GetLocalDate(weekStart.Value)
                : GetCurrentMonday();

            var key = Key(weekStartDate);
            PublishedSchedules[key] = DateTime.UtcNow;
            return Ok(new
            {
                message = "Schedule shared with workers. They can now see their shifts on their schedule page.",
                weekStart = weekStartDate.ToString("yyyy-MM-dd"),
                publishedAt = PublishedSchedules[key].ToString("o")
            });
        }

        /// <summary>هل الجدول منشور لهذا الأسبوع؟ (لصفحة جدول العامل)</summary>
        [HttpGet("publish/status")]
        public IActionResult GetPublishStatus([FromQuery] DateTime weekStart)
        {
            var weekStartDate = GetLocalDate(weekStart);
            var key = Key(weekStartDate);
            if (!PublishedSchedules.TryGetValue(key, out var publishedAt))
                return Ok(new { published = false, publishedAt = (string?)null });

            return Ok(new { published = true, publishedAt = publishedAt.ToString("o") });
        }

        private static DateTime GetCurrentMonday()
        {
            var today = DateTime.Today;
            var dayOfWeek = (int)today.DayOfWeek;
            return today.AddDays(dayOfWeek == 0 ? -6 : dayOfWeek - 1).Date;
        }
    }
}

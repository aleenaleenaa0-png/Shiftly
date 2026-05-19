// =============================================================================
// User.cs — حساب المدير (Manager)
// =============================================================================
// المدير يسجل الدخول من جدول Users وليس Employees.
// للمختبر: جرّب manager@shiftly.com / manager123 بعد تشغيل السيرفر.
// =============================================================================

using System.ComponentModel.DataAnnotations;

namespace Backend.Models
{
    public class User
    {
        public int UserId { get; set; }

        [Required]
        [EmailAddress]
        [StringLength(200)]
        public string Email { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        public string FullName { get; set; } = string.Empty;

        [Required]
        [StringLength(200)]
        public string Password { get; set; } = string.Empty;
    }
}

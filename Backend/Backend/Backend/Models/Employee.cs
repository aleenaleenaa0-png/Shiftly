// =============================================================================
// Employee.cs — حساب العامل (Worker)
// =============================================================================
// العامل يسجل عبر SignUp ويُخزَّن هنا (مع Email و Password).
// LastName غير موجود في Access — الحقل للواجهة فقط (NotMapped).
// =============================================================================

using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models
{
    public class Employee
    {
        public int EmployeeId { get; set; }

        [Required]
        [StringLength(100)]
        public string FirstName { get; set; } = string.Empty;

        [NotMapped]
        public string LastName { get; set; } = string.Empty;

        [Range(0, double.MaxValue)]
        public decimal HourlyWage { get; set; }

        [Range(0, 10)]
        public double ProductivityScore { get; set; }

        [StringLength(200)]
        public string? Email { get; set; }

        [StringLength(200)]
        public string? Password { get; set; }

        public ICollection<Availability> Availabilities { get; set; } = new List<Availability>();
        public ICollection<Shift> Shifts { get; set; } = new List<Shift>();
    }
}

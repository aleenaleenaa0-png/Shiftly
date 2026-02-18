using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models
{
    public class Employee
    {
        public int EmployeeId { get; set; }

        [Required]
        [StringLength(100)]
        public string FirstName { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        public string LastName { get; set; } = string.Empty;

        [Range(0, double.MaxValue)]
        public decimal HourlyWage { get; set; }

        // 0-10 productivity score, higher is better
        [Range(0, 10)]
        public double ProductivityScore { get; set; }

        public int StoreId { get; set; }
        public Store? Store { get; set; }

        // Login credentials for employees
        [StringLength(200)]
        public string? Email { get; set; }

        [StringLength(200)]
        public string? Password { get; set; }

        public ICollection<Availability> Availabilities { get; set; } = new List<Availability>();
        public ICollection<Shift> Shifts { get; set; } = new List<Shift>();
    }
}



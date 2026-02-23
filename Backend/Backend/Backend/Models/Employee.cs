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

        // Access Employees table does NOT have LastName column
        [NotMapped]
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

        // Access Employees table does NOT have Password column - employees login with email only
        [NotMapped]
        public string? Password { get; set; }

        public ICollection<Availability> Availabilities { get; set; } = new List<Availability>();
        public ICollection<Shift> Shifts { get; set; } = new List<Shift>();
    }
}



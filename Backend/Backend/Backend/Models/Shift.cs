using System;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models
{
    public class Shift
    {
        public int ShiftId { get; set; }

        public int StoreId { get; set; }
        public Store? Store { get; set; }

        [Required]
        public DateTime StartTime { get; set; }

        [Required]
        public DateTime EndTime { get; set; }

        // Required productivity/sales target for this shift
        [Range(0, double.MaxValue)]
        public decimal RequiredProductivity { get; set; }

        public int? EmployeeId { get; set; }
        public Employee? Employee { get; set; }

        // Calculated match score for the assigned employee
        public double? MatchScore { get; set; }

        // Many-to-many relationship with Employees through Availabilities
        public ICollection<Availability> Availabilities { get; set; } = new List<Availability>();
    }
}



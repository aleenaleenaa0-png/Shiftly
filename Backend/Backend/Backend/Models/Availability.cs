using System;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models
{
    public class Availability
    {
        public int AvailabilityId { get; set; }

        public int EmployeeId { get; set; }
        public Employee? Employee { get; set; }

        [Required]
        public DayOfWeek DayOfWeek { get; set; }

        [Required]
        public TimeSpan StartTime { get; set; }

        [Required]
        public TimeSpan EndTime { get; set; }
    }
}



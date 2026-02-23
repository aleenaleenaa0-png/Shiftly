using System;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models
{
    public class Availability
    {
        public int AvailabilityId { get; set; }

        [Required]
        public int EmployeeId { get; set; }
        public Employee? Employee { get; set; }

        [Required]
        public int ShiftId { get; set; }
        public Shift? Shift { get; set; }

        [Required]
        public bool IsAvailable { get; set; }
    }
}



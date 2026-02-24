using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models
{
    public class Availability
    {
        [Column("AvailabilityID")]
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



using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models
{
    public class Shift
    {
        [Column("Shift_ID")]
        public int ShiftId { get; set; }

        [Required]
        [Column("Shift_StartTime")]
        public DateTime StartTime { get; set; }

        [Required]
        [Column("Shift_EndTime")]
        public DateTime EndTime { get; set; }

        [Range(0, double.MaxValue)]
        [Column("Shift_ReqThroughput")]
        public decimal? RequiredProductivity { get; set; }

        [Column("Shift_EmployeeID")]
        public int? EmployeeId { get; set; }
        public Employee? Employee { get; set; }

        [Column("Shift_SlotNumber")]
        public int? SlotNumber { get; set; }

        [NotMapped]
        public double? MatchScore { get; set; }

        public ICollection<Availability> Availabilities { get; set; } = new List<Availability>();
    }
}

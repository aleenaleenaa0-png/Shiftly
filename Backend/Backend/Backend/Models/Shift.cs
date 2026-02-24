using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Models
{
    public class Shift
    {
        [Column("Shift_ID")]
        public int ShiftId { get; set; }

        [Column("Shift_StoreID")]
        public int StoreId { get; set; }
        public Store? Store { get; set; }

        [Required]
        [Column("Shift_StartTime")]
        public DateTime StartTime { get; set; }

        [Required]
        [Column("Shift_EndTime")]
        public DateTime EndTime { get; set; }

        // Required productivity/sales target for this shift (nullable for legacy DB rows)
        [Range(0, double.MaxValue)]
        [Column("Shift_ReqThroughput")]
        public decimal? RequiredProductivity { get; set; }

        [Column("Shift_EmployeeID")]
        public int? EmployeeId { get; set; }
        public Employee? Employee { get; set; }

        // SlotNumber: Sequential number 1-14 representing the weekly slot
        // Slot 1 = Monday Morning, Slot 2 = Monday Afternoon, ..., Slot 14 = Sunday Afternoon
        [Column("Shift_SlotNumber")]
        public int? SlotNumber { get; set; } // Nullable to handle existing NULL values in database

        // MatchScore does NOT exist in Access Shifts table - mark as [NotMapped]
        [NotMapped]
        public double? MatchScore { get; set; }

        // Many-to-many relationship with Employees through Availabilities
        public ICollection<Availability> Availabilities { get; set; } = new List<Availability>();
    }
}



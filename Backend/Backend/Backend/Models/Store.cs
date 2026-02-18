using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Backend.Models
{
    public class Store
    {
        public int StoreId { get; set; }

        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [StringLength(200)]
        public string? Location { get; set; }

        [Range(0, double.MaxValue)]
        public decimal HourlySalesTarget { get; set; }

        [Range(0, double.MaxValue)]
        public decimal HourlyLaborBudget { get; set; }

        public ICollection<Employee> Employees { get; set; } = new List<Employee>();
        public ICollection<User> Users { get; set; } = new List<User>();
        public ICollection<Shift> Shifts { get; set; } = new List<Shift>();
    }
}



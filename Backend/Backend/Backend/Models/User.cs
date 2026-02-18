using System.ComponentModel.DataAnnotations;

namespace Backend.Models
{
    public class User
    {
        public int UserId { get; set; }

        [Required]
        [EmailAddress]
        [StringLength(200)]
        public string Email { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        public string FullName { get; set; } = string.Empty;

        // NOTE: For demo purposes only. In production, store a secure password hash instead.
        [Required]
        [StringLength(200)]
        public string Password { get; set; } = string.Empty;

        public int StoreId { get; set; }
        public Store? Store { get; set; }
    }
}



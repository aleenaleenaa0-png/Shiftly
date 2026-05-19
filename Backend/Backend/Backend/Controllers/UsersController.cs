using Backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly AppData _db;

        public UsersController(AppData db) => _db = db;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetUsers()
        {
            try
            {
                var users = await _db.Users
                    .Select(u => new { u.UserId, u.Email, u.FullName })
                    .ToListAsync();
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to fetch users", message = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetUser(int id)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound(new { error = "User not found" });
            return Ok(new { user.UserId, user.Email, user.FullName });
        }

        [HttpPost]
        public async Task<ActionResult<object>> CreateUser([FromBody] CreateUserDto dto)
        {
            if (dto == null)
                return BadRequest(new { error = "Request body is required" });
            if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.FullName) || string.IsNullOrWhiteSpace(dto.Password))
                return BadRequest(new { error = "Email, full name, and password are required" });

            if (await _db.Users.AnyAsync(u => u.Email == dto.Email.Trim()))
                return Conflict(new { error = "Email already registered" });

            var newUser = new User
            {
                Email = dto.Email.Trim(),
                FullName = dto.FullName.Trim(),
                Password = dto.Password.Trim()
            };
            _db.Users.Add(newUser);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = "User created successfully",
                user = new { newUser.UserId, newUser.Email, newUser.FullName }
            });
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<object>> UpdateUser(int id, [FromBody] UpdateUserDto dto)
        {
            if (dto == null) return BadRequest(new { error = "Request body is required" });
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound(new { error = "User not found" });

            if (!string.IsNullOrWhiteSpace(dto.FullName))
                user.FullName = dto.FullName.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Password))
                user.Password = dto.Password.Trim();

            await _db.SaveChangesAsync();
            return Ok(new
            {
                success = true,
                message = "User updated successfully",
                user = new { user.UserId, user.Email, user.FullName }
            });
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteUser(int id)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound(new { error = "User not found" });
            _db.Users.Remove(user);
            await _db.SaveChangesAsync();
            return Ok(new { success = true, message = "User deleted successfully" });
        }
    }

    public class CreateUserDto
    {
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class UpdateUserDto
    {
        public string? FullName { get; set; }
        public string? Password { get; set; }
    }
}

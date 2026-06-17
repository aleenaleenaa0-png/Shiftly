using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Manager")]
    public class UsersController : ControllerBase
    {
        private const string PrimaryManagerEmail = "manager@Shiftly.com";
        private readonly IConfiguration _config;

        public UsersController(IConfiguration config)
        {
            _config = config;
        }

        private string ConnectionString => ShiftBootstrap.NormalizeOleDbConnectionString(
            _config.GetConnectionString("ShiftlyConnection") ?? DatabasePaths.DefaultConnectionString);

        private bool IsPrimaryManager()
        {
            var email = User.FindFirst(ClaimTypes.Email)?.Value;
            return string.Equals(email, PrimaryManagerEmail, StringComparison.OrdinalIgnoreCase);
        }

        [HttpGet]
        public ActionResult<IEnumerable<object>> GetUsers()
        {
            if (!IsPrimaryManager())
                return Forbid();

            try
            {
                var users = AccessSchemaHelper.ListUsers(ConnectionString)
                    .Select(u => new
                    {
                        UserId = u["UserId"],
                        Email = u["Email"],
                        FullName = u["FullName"]
                    })
                    .ToList();
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to fetch users", message = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public ActionResult<object> GetUser(int id)
        {
            if (!IsPrimaryManager())
                return Forbid();

            var user = AccessSchemaHelper.GetUserById(ConnectionString, id);
            if (user == null) return NotFound(new { error = "User not found" });
            return Ok(new { UserId = user["UserId"], Email = user["Email"], FullName = user["FullName"] });
        }

        [HttpPost]
        public ActionResult<object> CreateUser([FromBody] CreateUserDto dto)
        {
            if (!IsPrimaryManager())
                return Forbid();

            if (dto == null)
                return BadRequest(new { error = "Request body is required" });
            if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.FullName) || string.IsNullOrWhiteSpace(dto.Password))
                return BadRequest(new { error = "Email, full name, and password are required" });

            if (AccessSchemaHelper.UserEmailExists(ConnectionString, dto.Email))
                return Conflict(new { error = "Email already registered" });

            var newUserId = AccessSchemaHelper.InsertUser(
                ConnectionString,
                dto.Email,
                dto.FullName,
                dto.Password);

            return Ok(new
            {
                success = true,
                message = "User created successfully",
                user = new { UserId = newUserId, Email = dto.Email.Trim(), FullName = dto.FullName.Trim() }
            });
        }

        [HttpPut("{id}")]
        public ActionResult<object> UpdateUser(int id, [FromBody] UpdateUserDto dto)
        {
            if (!IsPrimaryManager())
                return Forbid();

            if (dto == null) return BadRequest(new { error = "Request body is required" });
            var user = AccessSchemaHelper.GetUserById(ConnectionString, id);
            if (user == null) return NotFound(new { error = "User not found" });

            var fullName = string.IsNullOrWhiteSpace(dto.FullName)
                ? user["FullName"]?.ToString() ?? ""
                : dto.FullName.Trim();

            AccessSchemaHelper.UpdateUser(ConnectionString, id, fullName, dto.Password);
            return Ok(new
            {
                success = true,
                message = "User updated successfully",
                user = new { UserId = user["UserId"], Email = user["Email"], FullName = fullName }
            });
        }

        [HttpDelete("{id}")]
        public ActionResult DeleteUser(int id)
        {
            if (!IsPrimaryManager())
                return Forbid();

            var user = AccessSchemaHelper.GetUserById(ConnectionString, id);
            if (user == null) return NotFound(new { error = "User not found" });
            AccessSchemaHelper.DeleteUser(ConnectionString, id);
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

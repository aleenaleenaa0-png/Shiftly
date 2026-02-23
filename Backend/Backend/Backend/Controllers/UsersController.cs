using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly AppData _db;

        public UsersController(AppData db)
        {
            _db = db;
        }

        // GET: api/Users
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetUsers()
        {
            try
            {
                // Ensure Users table exists
                try
                {
                    var testUser = await _db.Users
                        .Select(u => new { u.UserId, u.Email, u.FullName, u.StoreId })
                        .FirstOrDefaultAsync();
                    Console.WriteLine("✓ Users table exists with correct schema");
                }
                catch (Exception tableEx)
                {
                    if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist"))
                    {
                        Console.WriteLine("⚠ Users table doesn't exist. Creating it...");
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync(@"
                                CREATE TABLE Users (
                                    UserId AUTOINCREMENT PRIMARY KEY,
                                    Email TEXT(200) NOT NULL,
                                    FullName TEXT(100) NOT NULL,
                                    Password TEXT(200) NOT NULL,
                                    StoreId INTEGER NOT NULL
                                )
                            ");
                            Console.WriteLine("✓ Created Users table");
                        }
                        catch (Exception createEx)
                        {
                            Console.WriteLine($"⚠ Error creating Users table: {createEx.Message}");
                        }
                    }
                }

                var users = await _db.Users
                    .Include(u => u.Store)
                    .Select(u => new
                    {
                        u.UserId,
                        u.Email,
                        u.FullName,
                        u.StoreId,
                        StoreName = u.Store != null ? u.Store.Name : null
                    })
                    .ToListAsync();

                return Ok(users);
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { error = "Database is locked", message = "The database is currently open in Microsoft Access or another application. Please close it and try again." });
                }
                Console.WriteLine($"Error fetching users: {ex.Message}");
                return StatusCode(500, new { error = "Failed to fetch users", message = ex.Message });
            }
        }

        // GET: api/Users/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetUser(int id)
        {
            try
            {
                var user = await _db.Users
                    .Include(u => u.Store)
                    .FirstOrDefaultAsync(u => u.UserId == id);

                if (user == null)
                {
                    return NotFound(new { error = "User not found" });
                }

                return Ok(new
                {
                    user.UserId,
                    user.Email,
                    user.FullName,
                    user.StoreId,
                    StoreName = user.Store?.Name
                });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { error = "Database is locked", message = "The database is currently open in Microsoft Access or another application. Please close it and try again." });
                }
                Console.WriteLine($"Error fetching user: {ex.Message}");
                return StatusCode(500, new { error = "Failed to fetch user", message = ex.Message });
            }
        }

        // POST: api/Users
        [HttpPost]
        public async Task<ActionResult<object>> CreateUser([FromBody] CreateUserDto dto)
        {
            try
            {
                if (dto == null)
                {
                    return BadRequest(new { error = "Request body is required" });
                }

                if (string.IsNullOrWhiteSpace(dto.Email) || 
                    string.IsNullOrWhiteSpace(dto.FullName) || 
                    string.IsNullOrWhiteSpace(dto.Password))
                {
                    return BadRequest(new { error = "Email, full name, and password are required" });
                }

                if (dto.StoreId <= 0)
                {
                    return BadRequest(new { error = "Valid store ID is required" });
                }

                // Check if email already exists
                var existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Email == dto.Email.Trim());
                if (existingUser != null)
                {
                    return Conflict(new { error = "Email already registered" });
                }

                // Verify store exists
                var store = await _db.Stores.FindAsync(dto.StoreId);
                if (store == null)
                {
                    return BadRequest(new { error = $"Invalid store ID: {dto.StoreId}" });
                }

                var newUser = new User
                {
                    Email = dto.Email.Trim(),
                    FullName = dto.FullName.Trim(),
                    Password = dto.Password.Trim(), // NOTE: In production, hash this password
                    StoreId = dto.StoreId
                };

                _db.Users.Add(newUser);
                await _db.SaveChangesAsync();

                Console.WriteLine($"✓ Created user - Email: {newUser.Email}, ID: {newUser.UserId}");

                return Ok(new
                {
                    success = true,
                    message = "User created successfully",
                    user = new
                    {
                        newUser.UserId,
                        newUser.Email,
                        newUser.FullName,
                        newUser.StoreId,
                        StoreName = store.Name
                    }
                });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { error = "Database is locked", message = "The database is currently open in Microsoft Access or another application. Please close it and try again." });
                }
                Console.WriteLine($"Error creating user: {ex.Message}");
                return StatusCode(500, new { error = "Failed to create user", message = ex.Message });
            }
        }

        // PUT: api/Users/5
        [HttpPut("{id}")]
        public async Task<ActionResult<object>> UpdateUser(int id, [FromBody] UpdateUserDto dto)
        {
            try
            {
                if (dto == null)
                {
                    return BadRequest(new { error = "Request body is required" });
                }

                var user = await _db.Users.FindAsync(id);
                if (user == null)
                {
                    return NotFound(new { error = "User not found" });
                }

                // Update full name
                if (!string.IsNullOrWhiteSpace(dto.FullName))
                {
                    user.FullName = dto.FullName.Trim();
                }

                // Update password only if provided
                if (!string.IsNullOrWhiteSpace(dto.Password))
                {
                    user.Password = dto.Password.Trim(); // NOTE: In production, hash this password
                }

                // Update store if provided
                if (dto.StoreId > 0)
                {
                    var store = await _db.Stores.FindAsync(dto.StoreId);
                    if (store == null)
                    {
                        return BadRequest(new { error = $"Invalid store ID: {dto.StoreId}" });
                    }
                    user.StoreId = dto.StoreId;
                }

                await _db.SaveChangesAsync();

                // Reload with store
                await _db.Entry(user).Reference(u => u.Store).LoadAsync();

                Console.WriteLine($"✓ Updated user - Email: {user.Email}, ID: {user.UserId}");

                return Ok(new
                {
                    success = true,
                    message = "User updated successfully",
                    user = new
                    {
                        user.UserId,
                        user.Email,
                        user.FullName,
                        user.StoreId,
                        StoreName = user.Store?.Name
                    }
                });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { error = "Database is locked", message = "The database is currently open in Microsoft Access or another application. Please close it and try again." });
                }
                Console.WriteLine($"Error updating user: {ex.Message}");
                return StatusCode(500, new { error = "Failed to update user", message = ex.Message });
            }
        }

        // DELETE: api/Users/5
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteUser(int id)
        {
            try
            {
                var user = await _db.Users.FindAsync(id);
                if (user == null)
                {
                    return NotFound(new { error = "User not found" });
                }

                _db.Users.Remove(user);
                await _db.SaveChangesAsync();

                Console.WriteLine($"✓ Deleted user - Email: {user.Email}, ID: {user.UserId}");

                return Ok(new { success = true, message = "User deleted successfully" });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new { error = "Database is locked", message = "The database is currently open in Microsoft Access or another application. Please close it and try again." });
                }
                Console.WriteLine($"Error deleting user: {ex.Message}");
                return StatusCode(500, new { error = "Failed to delete user", message = ex.Message });
            }
        }
    }

    public class CreateUserDto
    {
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public int StoreId { get; set; }
    }

    public class UpdateUserDto
    {
        public string? FullName { get; set; }
        public string? Password { get; set; }
        public int StoreId { get; set; }
    }
}


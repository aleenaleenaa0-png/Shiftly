// =============================================================================
// AccountController.cs — تسجيل الدخول والتسجيل
// =============================================================================
// login: يبحث أولاً في Users (مدير) ثم في Employees (عامل).
// signup: يُنشئ عاملاً جديداً في Employees فقط (ليس مديراً).
// me: من مسجّل الدخول حالياً؟ (يُستخدم عند فتح التطبيق).
//
// للمختبر:
//   - مدير: manager@shiftly.com / manager123
//   - عامل: سجّل من SignUp ثم سجّل دخول بنفس البريد وكلمة المرور
// =============================================================================

using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Linq;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AccountController : ControllerBase
    {
        private readonly AppData _db;
        private readonly IConfiguration _config;
        private readonly AccessEmployeeStore _employees;

        public AccountController(AppData db, IConfiguration config, AccessEmployeeStore employees)
        {
            _db = db;
            _config = config;
            _employees = employees;
        }

        private string ConnectionString => ShiftBootstrap.NormalizeOleDbConnectionString(
            _config.GetConnectionString("ShiftlyConnection") ?? DatabasePaths.DefaultConnectionString);

        /// <summary>تسجيل الدخول — يُرجع دور Manager أو Employee مع Cookie.</summary>
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto loginDto)
        {
            try
            {
                // Check if loginDto is null
                if (loginDto == null)
                {
                    return BadRequest(new { success = false, error = "Invalid request", message = "Request body is required" });
                }

                if (string.IsNullOrEmpty(loginDto.Email) || string.IsNullOrEmpty(loginDto.Password))
                {
                    return BadRequest(new { success = false, error = "Email and password are required" });
                }

                // Trim email and password to avoid whitespace issues
                var email = loginDto.Email.Trim();
                var password = loginDto.Password.Trim();

                Console.WriteLine($"Login attempt - Email: {email?.Substring(0, Math.Min(email.Length, 20))}...");

                // Check database connection first
                try
                {
                    var canConnect = await _db.Database.CanConnectAsync();
                    if (!canConnect)
                    {
                        Console.WriteLine("⚠ Database connection failed");
                        return StatusCode(500, new 
                        { 
                            success = false,
                            error = "Database connection failed", 
                            message = "Cannot connect to database. Please check if the database file exists and is accessible."
                        });
                    }
                }
                catch (Exception dbConnEx)
                {
                    Console.WriteLine($"⚠ Database connection check failed: {dbConnEx.Message}");
                    return StatusCode(500, new 
                    { 
                        success = false,
                        error = "Database error", 
                        message = $"Database connection error: {dbConnEx.Message}",
                        details = dbConnEx.InnerException?.Message
                    });
                }

                AccessSchemaHelper.EnsureUsersTable(ConnectionString);

                // First check if it's a manager (User)
                User? user = null;
                try
                {
                    // Query user without Include first to avoid relationship issues
                    Console.WriteLine($"Attempting to query Users table for email: {email}");
                    try
                    {
                        user = await _db.Users
                            .FirstOrDefaultAsync(u => u.Email == email && u.Password == password);
                        Console.WriteLine($"Query completed. User found: {user != null}");
                    }
                    catch (Exception queryEx)
                    {
                        Console.WriteLine($"⚠ Error querying Users table: {queryEx.Message}");
                        Console.WriteLine($"⚠ Query exception type: {queryEx.GetType().Name}");
                        if (queryEx.InnerException != null)
                        {
                            Console.WriteLine($"⚠ Inner exception: {queryEx.InnerException.Message}");
                        }
                        // Check if it's a schema issue (Role column might exist)
                        if (queryEx.Message.Contains("Role") || queryEx.Message.Contains("unknown field"))
                        {
                            Console.WriteLine("⚠ Possible schema mismatch - Users table may have Role column that model doesn't have");
                            Console.WriteLine("⚠ Try dropping and recreating the Users table, or remove the Role column manually");
                        }
                        throw; // Re-throw to be caught by outer catch
                    }
                    
                    // If found, get store name separately (safely)
                }
                catch (Exception userEx)
                {
                    Console.WriteLine($"Error querying Users table: {userEx.Message}");
                    if (userEx.InnerException != null)
                    {
                        Console.WriteLine($"Inner exception: {userEx.InnerException.Message}");
                    }
                    // Continue to check Employees table
                }
                
                Console.WriteLine($"User lookup result: {(user != null ? $"Found user ID {user.UserId}" : "No user found")}");
                
                // Safety check - if user is null, make sure we don't try to access it
                if (user != null && user.UserId <= 0)
                {
                    Console.WriteLine("⚠ Invalid user ID detected, treating as null");
                    user = null;
                }

                // If manager credentials are used but user doesn't exist, create it automatically
                if (user == null && email == "manager@shiftly.com" && password == "manager123")
                {
                    Console.WriteLine("Manager credentials detected but user doesn't exist. Creating manager user...");
                    try
                    {
                        user = new User
                        {
                            Email = "manager@shiftly.com",
                            FullName = "Default Manager",
                            Password = "manager123"
                        };

                        _db.Users.Add(user);
                        await _db.SaveChangesAsync();
                        Console.WriteLine($"✓ Created manager user - Email: {user.Email}, ID: {user.UserId}");
                    }
                    catch (Exception createEx)
                    {
                        Console.WriteLine($"⚠ Error creating manager user: {createEx.Message}");
                        Console.WriteLine($"⚠ Stack trace: {createEx.StackTrace}");
                        // Continue - will return unauthorized below
                        user = null;
                    }
                }

                // CRITICAL: Only manager@shiftly.com with manager123 can be a Manager
                // All other users (including Users table entries) should be treated as Workers/Employees
                bool isManagerCredentials = email == "manager@shiftly.com" && password == "manager123";
                
                // If it's manager credentials, ONLY check Users table, don't check Employees
                if (isManagerCredentials)
                {
                    if (user != null)
                {
                    // Manager login - only for manager@shiftly.com/manager123
                    var claims = new List<Claim>
                    {
                        new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),
                        new Claim(ClaimTypes.Name, user.FullName),
                        new Claim(ClaimTypes.Email, user.Email),
                        new Claim(ClaimTypes.Role, "Manager"),
                        new Claim("UserType", "Manager")
                    };

                    var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
                    var authProperties = new AuthenticationProperties
                    {
                        IsPersistent = true,
                        ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
                    };

                    await HttpContext.SignInAsync(
                        CookieAuthenticationDefaults.AuthenticationScheme,
                        new ClaimsPrincipal(claimsIdentity),
                        authProperties);

                        Console.WriteLine($"✓✓✓ MANAGER LOGIN SUCCESS - User ID: {user.UserId}, Email: {user.Email}");
                    return Ok(new
                    {
                        success = true,
                        user = new
                        {
                            userId = user.UserId,
                            fullName = user.FullName,
                            email = user.Email,
                            role = "Manager",
                            userType = "Manager"
                        }
                    });
                    }
                    else
                    {
                        // Manager credentials but user not found - already tried to create above
                        Console.WriteLine("✗✗✗ Manager credentials provided but user not found and creation failed");
                        return Unauthorized(new { success = false, error = "Invalid email or password" });
                    }
                }
                else if (user != null && !isManagerCredentials)
                {
                    // User exists in Users table but is NOT manager credentials
                    // Treat them as a Worker/Employee instead
                    Console.WriteLine($"User {user.Email} found in Users table but not manager credentials. Treating as Worker.");
                    // Continue to employee lookup below - don't log them in as manager
                    user = null;
                }

                // Check if it's an employee - ONLY if NOT manager credentials
                Employee? employee = null;

                if (!isManagerCredentials)
                {
                    try
                    {
                        employee = await _db.Employees
                            .Where(e =>
                                e.Email != null &&
                                e.Email.Trim().Equals(email, StringComparison.OrdinalIgnoreCase) &&
                                e.Password != null &&
                                e.Password.Trim() == password)
                            .OrderBy(e => e.EmployeeId)
                            .FirstOrDefaultAsync();
                    }
                    catch (Exception empEx)
                    {
                        Console.WriteLine($"⚠ EF employee login lookup: {empEx.Message}");
                    }

                    if (employee == null)
                    {
                        var oleEmp = _employees.FindByEmailPassword(email, password);
                        if (oleEmp.HasValue)
                        {
                            employee = new Employee
                            {
                                EmployeeId = oleEmp.Value.EmployeeId,
                                FirstName = oleEmp.Value.FirstName,
                                Email = oleEmp.Value.Email,
                                Password = password
                            };
                        }
                    }
                }

                if (employee != null)
                {
                    // Employee login - Access structure: no LastName column
                    var claims = new List<Claim>
                    {
                        new Claim(ClaimTypes.NameIdentifier, employee.EmployeeId.ToString()),
                        new Claim(ClaimTypes.Name, employee.FirstName ?? ""), // No LastName in Access
                        new Claim(ClaimTypes.Email, employee.Email ?? ""),
                        new Claim(ClaimTypes.Role, "Employee"),
                        new Claim("UserType", "Employee")
                    };

                    var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
                    var authProperties = new AuthenticationProperties
                    {
                        IsPersistent = true,
                        ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
                    };

                    await HttpContext.SignInAsync(
                        CookieAuthenticationDefaults.AuthenticationScheme,
                        new ClaimsPrincipal(claimsIdentity),
                        authProperties);

                    return Ok(new
                    {
                        success = true,
                        user = new
                        {
                            userId = employee.EmployeeId,
                            fullName = employee.FirstName.Trim(), // Username is stored in FirstName
                            email = employee.Email,
                            role = "Employee",
                            userType = "Employee"
                        }
                    });
                }

                return Unauthorized(new { success = false, error = "Invalid email or password" });
            }
            catch (Exception ex)
            {
                // Log the full error details
                Console.WriteLine("═══════════════════════════════════════");
                Console.WriteLine($"LOGIN ERROR: {ex.GetType().Name}");
                Console.WriteLine($"Message: {ex.Message}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner Exception: {ex.InnerException.GetType().Name}");
                    Console.WriteLine($"Inner Message: {ex.InnerException.Message}");
                }
                Console.WriteLine($"Stack Trace: {ex.StackTrace}");
                Console.WriteLine("═══════════════════════════════════════");
                
                // Always return valid JSON, even on error
                try
                {
                    if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                    {
                        return StatusCode(503, new
                        {
                            success = false,
                            error = "Database is locked",
                            message = "The database is currently open in Microsoft Access or another application. Please close it and try again."
                        });
                    }
                    
                    // Check for database connection issues
                    if (ex.Message.Contains("cannot find") || ex.Message.Contains("does not exist") || ex.Message.Contains("no such table"))
                    {
                        return StatusCode(500, new 
                        { 
                            success = false,
                            error = "Database error", 
                            message = "Database tables may not be initialized. Please ensure the backend has started properly.",
                            details = ex.Message
                        });
                    }
                    
                    // Generic error response
                    var errorResponse = new 
                    { 
                        success = false,
                        error = "Login failed", 
                        message = ex.Message ?? "An unknown error occurred",
                        details = ex.InnerException?.Message ?? ex.ToString(),
                        exceptionType = ex.GetType().Name
                    };
                    
                    return StatusCode(500, errorResponse);
                }
                catch (Exception responseEx)
                {
                    // If even creating the error response fails, return a simple text response
                    Console.WriteLine($"CRITICAL: Failed to create error response: {responseEx.Message}");
                    Response.StatusCode = 500;
                    Response.ContentType = "application/json";
                    await Response.WriteAsync("{\"success\":false,\"error\":\"Internal server error\",\"message\":\"An error occurred while processing your request\"}");
                    return new StatusCodeResult(500);
                }
            }
        }

        /// <summary>Where app saves data — open this exact file in Access.</summary>
        [HttpGet("database-info")]
        public IActionResult GetDatabaseInfo()
        {
            try
            {
                _employees.EnsureDatabaseReady();
                return Ok(new
                {
                    databasePath = _employees.FilePath,
                    employeeCount = _employees.Count(),
                    employees = _employees.ListAll()
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>تسجيل عامل جديد — يُحفظ في Employees (ليس Users).</summary>
        [HttpPost("signup")]
        public async Task<IActionResult> SignUp([FromBody] SignUpDto signUpDto)
        {
            try
            {
                // Log received data for debugging
                Console.WriteLine($"SignUp received - Email: {signUpDto?.Email}, Username: {signUpDto?.Username}");

                if (signUpDto == null)
                {
                    return BadRequest(new { error = "Request body is required" });
                }

                if (string.IsNullOrWhiteSpace(signUpDto.Email) || 
                    string.IsNullOrWhiteSpace(signUpDto.Username))
                {
                    return BadRequest(new { error = "Email and username are required" });
                }

                if (string.IsNullOrWhiteSpace(signUpDto.Password))
                {
                    return BadRequest(new { error = "Password is required" });
                }

                AccessSchemaHelper.EnsureUsersTable(ConnectionString);

                var username = signUpDto.Username.Trim();
                var password = signUpDto.Password.Trim();
                var email = signUpDto.Email.Trim();
                var firstName = username;

                if (string.IsNullOrWhiteSpace(username))
                    return BadRequest(new { error = "Username is required" });
                if (string.IsNullOrWhiteSpace(email))
                    return BadRequest(new { error = "Email is required" });
                if (password.Length < 3)
                    return BadRequest(new { error = "Password must be at least 3 characters" });

                if (_employees.EmailExists(email))
                    return Conflict(new { error = "Email already registered" });

                int newEmployeeId;
                try
                {
                    var id = _employees.Insert(firstName, email, password);
                    if (!id.HasValue)
                    {
                        return StatusCode(500, new
                        {
                            error = "Failed to create employee",
                            message = "Could not save to Access. Close Microsoft Access and try again.",
                            databasePath = _employees.FilePath
                        });
                    }
                    newEmployeeId = id.Value;
                }
                catch (InvalidOperationException ex)
                {
                    return StatusCode(503, new
                    {
                        error = "Database is locked",
                        message = ex.Message,
                        databasePath = _employees.FilePath
                    });
                }

                var saved = AccessSchemaHelper.GetEmployeeById(ConnectionString, newEmployeeId);

                return Ok(new
                {
                    success = true,
                    message = "Account created successfully. Please login.",
                    databasePath = _employees.FilePath,
                    employee = saved,
                    user = new
                    {
                        userId = newEmployeeId,
                        fullName = firstName,
                        email,
                        role = "Employee",
                        userType = "Employee"
                    }
                });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("exclusively") || ex.Message.Contains("already opened"))
                {
                    return StatusCode(503, new
                    {
                        error = "Database is locked",
                        message = "The database is currently open in Microsoft Access or another application. Please close it and try again."
                    });
                }
                
                // Get inner exception for more details
                var errorMessage = ex.Message;
                var innerException = ex.InnerException?.Message ?? "";
                var fullError = $"{errorMessage} {innerException}".Trim();
                
                Console.WriteLine($"Sign up error: {fullError}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                
                return StatusCode(500, new 
                { 
                    error = "Sign up failed", 
                    message = fullError,
                    details = ex.InnerException?.ToString() ?? ex.ToString()
                });
            }
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Ok(new { success = true, message = "Logged out successfully" });
        }

        // POST: api/account/create-manager
        // Endpoint to ensure default manager exists
        [HttpPost("create-manager")]
        public async Task<IActionResult> CreateManager()
        {
            try
            {
                // Check if manager already exists
                var existingManager = await _db.Users
                    .Where(u => u.Email == "manager@shiftly.com")
                    .OrderBy(u => u.UserId)
                    .FirstOrDefaultAsync();
                if (existingManager != null)
                {
                    return Ok(new 
                    { 
                        success = true, 
                        message = "Manager already exists",
                        user = new
                        {
                            userId = existingManager.UserId,
                            email = existingManager.Email,
                            fullName = existingManager.FullName
                        }
                    });
                }

                var manager = new User
                {
                    Email = "manager@shiftly.com",
                    FullName = "Default Manager",
                    Password = "manager123"
                };

                _db.Users.Add(manager);
                await _db.SaveChangesAsync();

                return Ok(new
                {
                    success = true,
                    message = "Manager created successfully",
                    user = new
                    {
                        userId = manager.UserId,
                        email = manager.Email,
                        fullName = manager.FullName,
                        password = "manager123"
                    }
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating manager: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = "Failed to create manager", message = ex.Message });
            }
        }

        // GET: api/account/test-employees-table
        // Test endpoint to diagnose Employees table structure
        [HttpGet("test-employees-table")]
        public async Task<IActionResult> TestEmployeesTable()
        {
            try
            {
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("TESTING EMPLOYEES TABLE STRUCTURE");
                Console.WriteLine("═══════════════════════════════════════════════════════");
                
                var results = new Dictionary<string, object>();
                
                // Test 1: Check if table exists
                try
                {
                    var count = await _db.Employees.CountAsync();
                    results["tableExists"] = true;
                    results["recordCount"] = count;
                    Console.WriteLine($"✓ Table exists with {count} records");
                }
                catch (Exception ex)
                {
                    results["tableExists"] = false;
                    results["tableError"] = ex.Message;
                    Console.WriteLine($"❌ Table check failed: {ex.Message}");
                }
                
                // Test 2: Try to query each column individually
                var columnsToTest = new[] { "EmployeeId", "FirstName", "LastName", "HourlyWage", "ProductivityScore", "Email", "Password" };
                var columnResults = new Dictionary<string, object>();
                
                foreach (var column in columnsToTest)
                {
                    try
                    {
                        // Try to select this column
                        object? testQuery = null;
                        switch (column)
                        {
                            case "EmployeeId":
                                testQuery = await _db.Employees.Select(e => e.EmployeeId).Take(1).ToListAsync();
                                break;
                            case "FirstName":
                                testQuery = await _db.Employees.Select(e => e.FirstName).Take(1).ToListAsync();
                                break;
                            case "LastName":
                                testQuery = await _db.Employees.Select(e => e.LastName).Take(1).ToListAsync();
                                break;
                            case "HourlyWage":
                                testQuery = await _db.Employees.Select(e => e.HourlyWage).Take(1).ToListAsync();
                                break;
                            case "ProductivityScore":
                                testQuery = await _db.Employees.Select(e => e.ProductivityScore).Take(1).ToListAsync();
                                break;
                            case "Email":
                                testQuery = await _db.Employees.Where(e => e.Email != null).Select(e => e.Email).Take(1).ToListAsync();
                                break;
                            case "Password":
                                testQuery = await _db.Employees.Where(e => e.Password != null).Select(e => e.Password).Take(1).ToListAsync();
                                break;
                        }
                        
                        columnResults[column] = new { exists = true, canQuery = true };
                        Console.WriteLine($"✓ Column '{column}' exists and can be queried");
                    }
                    catch (Exception colEx)
                    {
                        columnResults[column] = new { exists = false, error = colEx.Message };
                        Console.WriteLine($"❌ Column '{column}' error: {colEx.Message}");
                    }
                }
                
                results["columns"] = columnResults;
                
                // Test 3: Try a sample insert with minimal data
                try
                {
                    var testEmployee = new Employee
                    {
                        FirstName = "TEST",
                        LastName = "USER",
                        HourlyWage = 0m,
                        ProductivityScore = 5.0,
                        Email = "test@test.com",
                        Password = "test123"
                    };
                    
                    _db.Employees.Add(testEmployee);
                    await _db.SaveChangesAsync();
                    
                    var testId = testEmployee.EmployeeId;
                    
                    // Delete the test record
                    _db.Employees.Remove(testEmployee);
                    await _db.SaveChangesAsync();
                    
                    results["testInsert"] = new { success = true, testId = testId };
                    Console.WriteLine($"✓ Test insert succeeded (ID: {testId})");
                }
                catch (Exception insertEx)
                {
                    results["testInsert"] = new { success = false, error = insertEx.Message, innerException = insertEx.InnerException?.Message };
                    Console.WriteLine($"❌ Test insert failed: {insertEx.Message}");
                    if (insertEx.InnerException != null)
                    {
                        Console.WriteLine($"   Inner: {insertEx.InnerException.Message}");
                    }
                }
                
                Console.WriteLine("═══════════════════════════════════════════════════════");
                
                return Ok(new
                {
                    success = true,
                    message = "Table structure test completed",
                    results = results
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = "Test failed",
                    message = ex.Message,
                    details = ex.InnerException?.Message
                });
            }
        }

        /// <summary>من المستخدم الحالي؟ — يُستدعى عند فتح التطبيق للتحقق من الجلسة.</summary>
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser()
        {
            try
            {
                if (!User.Identity?.IsAuthenticated ?? true)
                {
                    return Unauthorized(new { error = "Not authenticated" });
                }

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var userTypeClaim = User.FindFirst("UserType")?.Value;
                
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int userId))
                {
                    return Unauthorized(new { error = "Invalid user session" });
                }

                if (userTypeClaim == "Manager")
                {
                    // Manager (User)
                    var user = await _db.Users.FindAsync(userId);
                    if (user == null)
                        return NotFound(new { error = "User not found" });

                    return Ok(new
                    {
                        userId = user.UserId,
                        fullName = user.FullName,
                        email = user.Email,
                        role = "Manager",
                        userType = "Manager"
                    });
                }

                var employee = await _db.Employees.FindAsync(userId);
                if (employee == null)
                    return NotFound(new { error = "Employee not found" });

                return Ok(new
                {
                    userId = employee.EmployeeId,
                    fullName = employee.FirstName.Trim(),
                    email = employee.Email,
                    role = "Employee",
                    userType = "Employee",
                    hourlyWage = employee.HourlyWage,
                    productivityScore = employee.ProductivityScore
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to get user", message = ex.Message });
            }
        }
    }

    public class LoginDto
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class SignUpDto
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty; // Changed from FullName to Username
    }
}



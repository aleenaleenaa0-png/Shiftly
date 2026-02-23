using Backend.Models;
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

        public AccountController(AppData db)
        {
            _db = db;
        }

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

                // Ensure Users table exists
                try
                {
                    await _db.Database.EnsureCreatedAsync();
                }
                catch (Exception ensureEx)
                {
                    Console.WriteLine($"⚠ EnsureCreated warning: {ensureEx.Message}");
                    // Continue anyway - table might already exist
                }

                // First check if it's a manager (User)
                User? user = null;
                try
                {
                    // Check if Users table exists by trying to count
                    try
                    {
                        var userCount = await _db.Users.CountAsync();
                        Console.WriteLine($"Users table exists with {userCount} records");
                    }
                    catch (Exception tableEx)
                    {
                        if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist"))
                        {
                            Console.WriteLine("Users table doesn't exist. Creating it...");
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
                                Console.WriteLine($"⚠ Could not create Users table: {createEx.Message}");
                            }
                        }
                    }

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
                    if (user != null)
                    {
                        try
                        {
                            var store = await _db.Stores.FindAsync(user.StoreId);
                            user.Store = store;
                        }
                        catch (Exception storeEx)
                        {
                            Console.WriteLine($"⚠ Could not load store for user: {storeEx.Message}");
                            // Continue without store - user can still log in
                        }
                    }
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
                        // Get or create a store
                        var firstStore = await _db.Stores.FirstOrDefaultAsync();
                        int storeId;
                        
                        if (firstStore == null)
                        {
                            // Create a default store
                            var defaultStore = new Store
                            {
                                Name = "Default Store",
                                Location = "Default Location",
                                HourlySalesTarget = 3000,
                                HourlyLaborBudget = 300
                            };
                            _db.Stores.Add(defaultStore);
                            await _db.SaveChangesAsync();
                            storeId = defaultStore.StoreId;
                            Console.WriteLine($"✓ Created default store (ID: {storeId}) for manager");
                        }
                        else
                        {
                            storeId = firstStore.StoreId;
                        }

                        // Create manager user
                        user = new User
                        {
                            Email = "manager@shiftly.com",
                            FullName = "Default Manager",
                            Password = "manager123",
                            StoreId = storeId
                        };

                        _db.Users.Add(user);
                        await _db.SaveChangesAsync();
                        Console.WriteLine($"✓ Created manager user - Email: {user.Email}, ID: {user.UserId}");
                        
                        // Load store for the user
                        try
                        {
                            var store = await _db.Stores.FindAsync(user.StoreId);
                            user.Store = store;
                        }
                        catch (Exception storeEx)
                        {
                            Console.WriteLine($"⚠ Could not load store for user: {storeEx.Message}");
                        }
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
                
                if (user != null && isManagerCredentials)
                {
                    // Manager login - only for manager@shiftly.com/manager123
                    var claims = new List<Claim>
                    {
                        new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),
                        new Claim(ClaimTypes.Name, user.FullName),
                        new Claim(ClaimTypes.Email, user.Email),
                        new Claim("StoreId", user.StoreId.ToString()),
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

                    return Ok(new
                    {
                        success = true,
                        user = new
                        {
                            userId = user.UserId,
                            fullName = user.FullName,
                            email = user.Email,
                            storeId = user.StoreId,
                            storeName = user.Store?.Name,
                            role = "Manager",
                            userType = "Manager"
                        }
                    });
                }
                else if (user != null && !isManagerCredentials)
                {
                    // User exists in Users table but is NOT manager credentials
                    // Treat them as a Worker/Employee instead
                    Console.WriteLine($"User {user.Email} found in Users table but not manager credentials. Treating as Worker.");
                    // Continue to employee lookup below - don't log them in as manager
                    user = null;
                }

                // Check if it's an employee - use raw SQL for maximum reliability
                Employee? employee = null;
                Console.WriteLine($"═══════════════════════════════════════");
                Console.WriteLine($"EMPLOYEE LOGIN ATTEMPT - Email: {email}");
                Console.WriteLine($"═══════════════════════════════════════");
                
                try
                {
                    // Access Employees table structure: EmployeeId, FirstName, HourlyWage, ProductivityScore, StoreId, Email
                    // NO LastName, NO Password columns - employees login with email only
                    Console.WriteLine("Querying employees - Access structure: EmployeeId, FirstName, HourlyWage, ProductivityScore, StoreId, Email");
                    Console.WriteLine("NOTE: Employees login with Email only (no password check)");
                    
                    // Get all employees and filter by email
                    List<Employee> allEmployees;
                    try
                    {
                        allEmployees = await _db.Employees.ToListAsync();
                        Console.WriteLine($"Found {allEmployees.Count} total employees");
                    }
                    catch (Exception allEx)
                    {
                        Console.WriteLine($"Employee query failed: {allEx.Message}");
                        allEmployees = new List<Employee>();
                    }
                    
                    // Filter by email only (no password check - employees don't have password column)
                    Console.WriteLine($"Searching for email: '{email}' (case-insensitive, no password check)");
                    employee = allEmployees
                        .Where(e => 
                            e.Email != null &&
                            e.Email.Trim().Equals(email, StringComparison.OrdinalIgnoreCase))
                        .FirstOrDefault();
                    
                    if (employee != null)
                    {
                        Console.WriteLine($"✓✓✓ EMPLOYEE FOUND! ID: {employee.EmployeeId}, Name: {employee.FirstName}");
                        
                        // Load store
                        try
                        {
                            var store = await _db.Stores.FindAsync(employee.StoreId);
                            employee.Store = store;
                            Console.WriteLine($"Store loaded: {store?.Name ?? "N/A"}");
                        }
                        catch (Exception storeEx)
                        {
                            Console.WriteLine($"⚠ Store load failed: {storeEx.Message}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"✗✗✗ NO MATCH FOUND for email: {email}");
                        if (allEmployees.Count > 0)
                        {
                            var withEmail = allEmployees.Where(e => e.Email != null).ToList();
                            Console.WriteLine($"Employees with Email in DB: {withEmail.Count}");
                            if (withEmail.Count > 0)
                            {
                                var sampleEmails = withEmail.Take(5).Select(e => $"'{e.Email}'").ToList();
                                Console.WriteLine($"Sample emails: {string.Join(", ", sampleEmails)}");
                            }
                        }
                        else
                        {
                            Console.WriteLine("⚠ No employees found in database at all!");
                        }
                    }
                }
                catch (Exception empEx)
                {
                    Console.WriteLine($"═══════════════════════════════════════");
                    Console.WriteLine($"CRITICAL ERROR in employee lookup:");
                    Console.WriteLine($"Type: {empEx.GetType().Name}");
                    Console.WriteLine($"Message: {empEx.Message}");
                    if (empEx.InnerException != null)
                    {
                        Console.WriteLine($"Inner: {empEx.InnerException.GetType().Name} - {empEx.InnerException.Message}");
                    }
                    Console.WriteLine($"Stack: {empEx.StackTrace}");
                    Console.WriteLine($"═══════════════════════════════════════");
                    employee = null;
                }
                
                Console.WriteLine($"Employee lookup result: {(employee != null ? $"Found employee ID {employee.EmployeeId}" : "No employee found")}");
                
                // Safety check - if employee is null, make sure we don't try to access it
                if (employee != null && employee.EmployeeId <= 0)
                {
                    Console.WriteLine("⚠ Invalid employee ID detected, treating as null");
                    employee = null;
                }

                if (employee != null)
                {
                    // Employee login - Access structure: no LastName column
                    var claims = new List<Claim>
                    {
                        new Claim(ClaimTypes.NameIdentifier, employee.EmployeeId.ToString()),
                        new Claim(ClaimTypes.Name, employee.FirstName ?? ""), // No LastName in Access
                        new Claim(ClaimTypes.Email, employee.Email ?? ""),
                        new Claim("StoreId", employee.StoreId.ToString()),
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
                            storeId = employee.StoreId,
                            storeName = employee.Store?.Name,
                            role = "Employee",
                            userType = "Employee"
                        }
                    });
                }

                Console.WriteLine("Login failed - no matching user or employee found");
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

        [HttpPost("signup")]
        public async Task<IActionResult> SignUp([FromBody] SignUpDto signUpDto)
        {
            try
            {
                // Log received data for debugging
                Console.WriteLine($"SignUp received - Email: {signUpDto?.Email}, Username: {signUpDto?.Username}, StoreId: {signUpDto?.StoreId}");

                if (signUpDto == null)
                {
                    return BadRequest(new { error = "Request body is required" });
                }

                if (string.IsNullOrWhiteSpace(signUpDto.Email) || 
                    string.IsNullOrWhiteSpace(signUpDto.Username))
                {
                    return BadRequest(new { error = "Email and username are required" });
                }
                // Note: Password is NOT required for employees - they login with email only
                // Access Employees table does NOT have Password column

                if (signUpDto.StoreId <= 0)
                {
                    return BadRequest(new { error = $"Please select a store. Received StoreId: {signUpDto.StoreId}" });
                }

                // Ensure Users table exists - use same approach as Stores table
                try
                {
                    // Try to query the table to see if it exists with correct schema
                    var testUser = await _db.Users
                        .Select(u => new { u.UserId, u.Email, u.FullName, u.Password, u.StoreId })
                        .FirstOrDefaultAsync();
                    Console.WriteLine("✓ Users table exists with correct schema");
                }
                catch (Exception tableEx)
                {
                    // Table doesn't exist or has wrong schema - create it using same method as Stores
                    Console.WriteLine($"⚠ Users table issue: {tableEx.Message}. Creating table...");
                    
                    try
                    {
                        // Drop table if it exists (might have wrong schema)
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync("DROP TABLE Users");
                            Console.WriteLine("✓ Dropped existing Users table");
                        }
                        catch (Exception dropEx)
                        {
                            // Table doesn't exist, that's fine
                            Console.WriteLine($"⚠ Could not drop (table doesn't exist): {dropEx.Message}");
                        }

                        // Create Users table using EXACT same syntax as Stores (which works)
                        // The key is using AUTOINCREMENT PRIMARY KEY together on same line
                        await _db.Database.ExecuteSqlRawAsync(@"
                            CREATE TABLE Users (
                                UserId AUTOINCREMENT PRIMARY KEY,
                                Email TEXT(200) NOT NULL,
                                FullName TEXT(100) NOT NULL,
                                Password TEXT(200) NOT NULL,
                                StoreId INTEGER NOT NULL
                            )
                        ");
                        Console.WriteLine("✓ Created Users table successfully");
                        
                        // Verify it was created
                        var verify = await _db.Users.CountAsync();
                        Console.WriteLine($"✓ Users table verified (has {verify} records)");
                    }
                    catch (Exception createEx)
                    {
                        Console.WriteLine($"⚠ Error creating Users table: {createEx.Message}");
                        Console.WriteLine($"⚠ Inner exception: {createEx.InnerException?.Message}");
                        
                        // If direct creation fails, the table might already exist from EnsureCreated
                        // Try to verify by querying
                        try
                        {
                            var test = await _db.Users.CountAsync();
                            Console.WriteLine($"✓ Users table exists (has {test} records) - creation may have succeeded");
                        }
                        catch (Exception finalEx)
                        {
                            return StatusCode(500, new 
                            { 
                                error = "Database setup error", 
                                message = $"Could not create or verify Users table. Create error: {createEx.Message}. Verify error: {finalEx.Message}",
                                details = createEx.InnerException?.Message ?? finalEx.Message
                            });
                        }
                    }
                }

                // Verify store exists FIRST (before any employee operations)
                var store = await _db.Stores.FindAsync(signUpDto.StoreId);
                if (store == null)
                {
                    return BadRequest(new { error = $"Invalid store ID: {signUpDto.StoreId}. Please select a valid store." });
                }

                // Access Employees table structure: EmployeeId, FirstName, HourlyWage, ProductivityScore, StoreId, Email
                // NO LastName, NO Password columns
                // Check if Email column exists (it should exist in Access)
                bool emailColumnExists = false;
                try
                {
                    // Try to query Email column to see if it exists
                    var testQuery = await _db.Employees
                        .Where(e => e.Email != null)
                        .Take(1)
                        .ToListAsync();
                    emailColumnExists = true;
                    Console.WriteLine("✓ Email column exists in Employees table");
                }
                catch (Exception schemaEx)
                {
                    if (schemaEx.Message.Contains("unknown field name") || schemaEx.Message.Contains("Email") || 
                        schemaEx.Message.Contains("required parameters"))
                    {
                        Console.WriteLine("⚠ Email column missing. Adding it...");
                        try
                        {
                            // Add Email column if it doesn't exist
                            await _db.Database.ExecuteSqlRawAsync("ALTER TABLE Employees ADD COLUMN Email TEXT(200)");
                            Console.WriteLine("✓ Added Email column");
                            emailColumnExists = true;
                        }
                        catch (Exception addEmailEx)
                        {
                            // Column might already exist, that's fine
                            if (addEmailEx.Message.Contains("already exists") || addEmailEx.Message.Contains("duplicate"))
                            {
                                Console.WriteLine("✓ Email column already exists");
                                emailColumnExists = true;
                            }
                            else
                            {
                                Console.WriteLine($"⚠ Could not add Email column: {addEmailEx.Message}");
                            }
                        }
                    }
                    else
                    {
                        Console.WriteLine($"⚠ Schema check error (non-Email related): {schemaEx.Message}");
                    }
                }

                // Check if email already exists (check both Users and Employees)
                // Use safe query that handles missing Email column
                bool emailExists = false;
                
                // Check Users table
                try
                {
                    var existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Email == signUpDto.Email);
                    if (existingUser != null)
                    {
                        emailExists = true;
                        Console.WriteLine($"⚠ Email {signUpDto.Email} already exists in Users table");
                    }
                }
                catch (Exception userCheckEx)
                {
                    Console.WriteLine($"⚠ Error checking Users table: {userCheckEx.Message}");
                    // Continue - might be a schema issue but we'll try Employees
                }
                
                // Check Employees table - use raw SQL if Email column might not exist
                if (!emailExists)
                {
                    try
                    {
                        if (emailColumnExists)
                        {
                            // Email column exists, use EF Core query
                            var existingEmployee = await _db.Employees.FirstOrDefaultAsync(e => e.Email == signUpDto.Email);
                            if (existingEmployee != null)
                            {
                                emailExists = true;
                                Console.WriteLine($"⚠ Email {signUpDto.Email} already exists in Employees table");
                            }
                        }
                        else
                        {
                            // Email column doesn't exist yet, use raw SQL to check
                            // Since column doesn't exist, no email can exist yet
                            Console.WriteLine("⚠ Email column doesn't exist yet - skipping email check (will be first employee)");
                            emailExists = false;
                        }
                    }
                    catch (Exception empCheckEx)
                    {
                        // If query fails, try raw SQL as fallback
                        if (empCheckEx.Message.Contains("Email") || empCheckEx.Message.Contains("required parameters") || 
                            empCheckEx.Message.Contains("unknown field"))
                        {
                            Console.WriteLine($"⚠ Email column check failed: {empCheckEx.Message}. Assuming email doesn't exist yet.");
                            emailExists = false;
                        }
                        else
                        {
                            Console.WriteLine($"⚠ Error checking Employees table: {empCheckEx.Message}");
                            // Continue - assume email doesn't exist to allow signup
                        }
                    }
                }
                
                if (emailExists)
                {
                    return Conflict(new { error = "Email already registered" });
                }

                // IMPORTANT: Signup creates an Employee (Worker), NOT a Manager (User)
                // Managers must be created through the UsersController by existing managers
                // This endpoint is ONLY for employee/worker signup
                // Access Employees table structure: EmployeeId, FirstName, HourlyWage, ProductivityScore, StoreId, Email
                // NO LastName, NO Password columns in Employees table
                var username = signUpDto.Username.Trim();
                var firstName = username; // Store username in FirstName

                // DETAILED PARAMETER VALIDATION AND LOGGING
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("SIGNUP DEBUG - Parameter Validation");
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine($"Username: '{username}' (Length: {username?.Length ?? 0}, IsNullOrEmpty: {string.IsNullOrEmpty(username)})");
                Console.WriteLine($"FirstName (from username): '{firstName}' (Length: {firstName?.Length ?? 0})");
                Console.WriteLine($"Email: '{signUpDto.Email?.Trim()}' (Length: {signUpDto.Email?.Trim()?.Length ?? 0}, IsNullOrEmpty: {string.IsNullOrEmpty(signUpDto.Email?.Trim())})");
                Console.WriteLine($"HourlyWage: 0 (Type: {0m.GetType().Name})");
                Console.WriteLine($"ProductivityScore: 5.0 (Type: {5.0.GetType().Name})");
                Console.WriteLine($"StoreId: {signUpDto.StoreId} (Type: {signUpDto.StoreId.GetType().Name}, IsValid: {signUpDto.StoreId > 0})");
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("NOTE: Employees table does NOT have LastName or Password columns");
                Console.WriteLine("Employees table structure: EmployeeId, FirstName, HourlyWage, ProductivityScore, StoreId, Email");
                Console.WriteLine("═══════════════════════════════════════════════════════");

                // Validate all required parameters
                var validationErrors = new List<string>();
                if (string.IsNullOrWhiteSpace(username))
                    validationErrors.Add("Username is required and cannot be empty");
                if (string.IsNullOrWhiteSpace(signUpDto.Email?.Trim()))
                    validationErrors.Add("Email is required and cannot be empty");
                // Note: Password is NOT stored for employees - they login with email only
                if (signUpDto.StoreId <= 0)
                    validationErrors.Add($"StoreId must be greater than 0 (received: {signUpDto.StoreId})");

                if (validationErrors.Any())
                {
                    var errorMsg = "Validation failed: " + string.Join("; ", validationErrors);
                    Console.WriteLine($"❌ {errorMsg}");
                    return BadRequest(new { error = "Validation failed", message = errorMsg, details = validationErrors });
                }

                // Ensure Employees table exists with correct schema
                try
                {
                    // Try to ensure table exists and has correct structure
                    await _db.Database.EnsureCreatedAsync();
                    
                    // Verify table structure by trying to query it
                    var testCount = await _db.Employees.CountAsync();
                    Console.WriteLine($"✓ Employees table exists with {testCount} records");
                    
                    // Try to get table schema information - only check columns that exist in Access
                    try
                    {
                        var schemaTest = await _db.Employees
                            .Select(e => new { 
                                e.EmployeeId, 
                                e.FirstName, 
                                e.HourlyWage, 
                                e.ProductivityScore, 
                                e.StoreId,
                                e.Email
                            })
                            .Take(1)
                            .ToListAsync();
                        Console.WriteLine("✓ All expected columns exist in Employees table");
                    }
                    catch (Exception schemaEx)
                    {
                        Console.WriteLine($"⚠ Schema check error: {schemaEx.Message}");
                        if (schemaEx.Message.Contains("Email"))
                        {
                            Console.WriteLine("⚠ Email column may be missing - will attempt to add it");
                        }
                    }
                }
                catch (Exception ensureEx)
                {
                    Console.WriteLine($"⚠ EnsureCreated warning: {ensureEx.Message}");
                    // Continue - table might already exist
                }

                Console.WriteLine($"Creating employee - Email: {signUpDto.Email.Trim()}, Username: {username}, StoreId: {signUpDto.StoreId}");

                // Strategy: Always insert WITHOUT Email/Password first (these columns may not exist)
                // Then add the columns if needed, then update the employee with Email/Password
                int newEmployeeId = 0;
                
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("STEP 1: Creating employee with Access table structure");
                Console.WriteLine($"  FirstName: '{firstName}'");
                Console.WriteLine($"  HourlyWage: 0");
                Console.WriteLine($"  ProductivityScore: 5.0");
                Console.WriteLine($"  StoreId: {signUpDto.StoreId}");
                Console.WriteLine($"  Email: '{signUpDto.Email.Trim()}'");
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("NOTE: Employees table does NOT have LastName or Password columns");
                Console.WriteLine("═══════════════════════════════════════════════════════");
                
                // Step 1: Create employee with only fields that exist in Access Employees table
                // Access structure: EmployeeId, FirstName, HourlyWage, ProductivityScore, StoreId, Email
                var basicEmployee = new Employee
                {
                    FirstName = firstName,
                    HourlyWage = 0m,
                    ProductivityScore = 5.0,
                    StoreId = signUpDto.StoreId,
                    Email = signUpDto.Email.Trim()
                    // NO LastName, NO Password - these don't exist in Access Employees table
                };
                
                try
                {
                    _db.Employees.Add(basicEmployee);
                    await _db.SaveChangesAsync();
                    newEmployeeId = basicEmployee.EmployeeId;
                    Console.WriteLine($"✓ Employee created successfully with ID: {newEmployeeId}");
                }
                catch (Exception basicInsertEx)
                {
                    Console.WriteLine("═══════════════════════════════════════════════════════");
                    Console.WriteLine($"❌ BASIC INSERT FAILED: {basicInsertEx.Message}");
                    Console.WriteLine($"Error Type: {basicInsertEx.GetType().Name}");
                    if (basicInsertEx.InnerException != null)
                    {
                        Console.WriteLine($"Inner Exception: {basicInsertEx.InnerException.Message}");
                    }
                    Console.WriteLine("═══════════════════════════════════════════════════════");
                    
                    return StatusCode(500, new 
                    { 
                        error = "Failed to create employee", 
                        message = $"Insert failed: {basicInsertEx.Message}",
                        details = new
                        {
                            innerException = basicInsertEx.InnerException?.Message
                        }
                    });
                }
                
                // Email is already set in the employee object above
                // Employees table in Access does NOT have Password column
                Console.WriteLine("✓ Employee created with Email (Password not stored - employees login with email only)");

                // Fetch the final employee data
                var finalEmployee = await _db.Employees
                    .Include(e => e.Store)
                    .FirstOrDefaultAsync(e => e.EmployeeId == newEmployeeId);
                
                if (finalEmployee == null)
                {
                    throw new Exception("Employee was created but could not be retrieved");
                }

                return Ok(new
                {
                    success = true,
                    message = "Account created successfully. Please login.",
                    user = new
                    {
                        userId = finalEmployee.EmployeeId,
                        fullName = finalEmployee.FirstName.Trim(), // Username is stored in FirstName
                        email = finalEmployee.Email ?? signUpDto.Email.Trim(),
                        storeId = finalEmployee.StoreId,
                        storeName = finalEmployee.Store?.Name ?? store.Name,
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
                var existingManager = await _db.Users.FirstOrDefaultAsync(u => u.Email == "manager@shiftly.com");
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

                // Get or create a store
                var firstStore = await _db.Stores.FirstOrDefaultAsync();
                int storeId;
                
                if (firstStore == null)
                {
                    // Create a default store
                    var defaultStore = new Store
                    {
                        Name = "Default Store",
                        Location = "Default Location",
                        HourlySalesTarget = 3000,
                        HourlyLaborBudget = 300
                    };
                    _db.Stores.Add(defaultStore);
                    await _db.SaveChangesAsync();
                    storeId = defaultStore.StoreId;
                    Console.WriteLine($"✓ Created default store (ID: {storeId}) for manager");
                }
                else
                {
                    storeId = firstStore.StoreId;
                }

                // Create manager user
                var manager = new User
                {
                    Email = "manager@shiftly.com",
                    FullName = "Default Manager",
                    Password = "manager123",
                    StoreId = storeId
                };

                _db.Users.Add(manager);
                await _db.SaveChangesAsync();

                Console.WriteLine($"✓ Created manager user - Email: {manager.Email}, ID: {manager.UserId}");

                return Ok(new
                {
                    success = true,
                    message = "Manager created successfully",
                    user = new
                    {
                        userId = manager.UserId,
                        email = manager.Email,
                        fullName = manager.FullName,
                        password = "manager123",
                        storeId = manager.StoreId
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
                var columnsToTest = new[] { "EmployeeId", "FirstName", "LastName", "HourlyWage", "ProductivityScore", "StoreId", "Email", "Password" };
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
                            case "StoreId":
                                testQuery = await _db.Employees.Select(e => e.StoreId).Take(1).ToListAsync();
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
                        StoreId = 1,
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
                    var user = await _db.Users
                        .Include(u => u.Store)
                        .FirstOrDefaultAsync(u => u.UserId == userId);

                    if (user == null)
                    {
                        return NotFound(new { error = "User not found" });
                    }

                    return Ok(new
                    {
                        userId = user.UserId,
                        fullName = user.FullName,
                        email = user.Email,
                        storeId = user.StoreId,
                        storeName = user.Store?.Name,
                        role = "Manager",
                        userType = "Manager"
                    });
                }
                else
                {
                    // Employee
                    var employee = await _db.Employees
                        .Include(e => e.Store)
                        .FirstOrDefaultAsync(e => e.EmployeeId == userId);

                    if (employee == null)
                    {
                        return NotFound(new { error = "Employee not found" });
                    }

                    return Ok(new
                    {
                        userId = employee.EmployeeId,
                        fullName = employee.FirstName.Trim(), // Username is stored in FirstName
                        email = employee.Email,
                        storeId = employee.StoreId,
                        storeName = employee.Store?.Name,
                        role = "Employee",
                        userType = "Employee"
                    });
                }
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
        public int StoreId { get; set; }
    }
}



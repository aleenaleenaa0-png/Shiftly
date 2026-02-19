using Backend.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

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
                    // First ensure Email/Password columns exist
                    try
                    {
                        var testQuery = await _db.Employees
                            .Where(e => e.Email != null)
                            .Take(1)
                            .ToListAsync();
                        Console.WriteLine("✓ Email column exists");
                    }
                    catch (Exception schemaEx)
                    {
                        if (schemaEx.Message.Contains("unknown field name") || schemaEx.Message.Contains("Email"))
                        {
                            Console.WriteLine("⚠ Adding Email/Password columns...");
                            try
                            {
                                await _db.Database.ExecuteSqlRawAsync("ALTER TABLE Employees ADD COLUMN Email TEXT(200)");
                                await _db.Database.ExecuteSqlRawAsync("ALTER TABLE Employees ADD COLUMN Password TEXT(200)");
                                Console.WriteLine("✓ Columns added");
                            }
                            catch (Exception alterEx)
                            {
                                Console.WriteLine($"⚠ Column add failed (may exist): {alterEx.Message}");
                            }
                        }
                    }
                    
                    // Use raw SQL to query - most reliable method
                    Console.WriteLine("Querying employees using raw SQL...");
                    var sql = @"
                        SELECT EmployeeId, FirstName, LastName, Email, Password, HourlyWage, ProductivityScore, StoreId 
                        FROM Employees 
                        WHERE Email IS NOT NULL AND Password IS NOT NULL
                    ";
                    
                    var employees = await _db.Employees
                        .FromSqlRaw(sql)
                        .ToListAsync();
                    
                    Console.WriteLine($"Found {employees.Count} employees with Email/Password");
                    
                    // Also try getting all employees as fallback
                    List<Employee> allEmployees = employees;
                    if (employees.Count == 0)
                    {
                        try
                        {
                            Console.WriteLine("Trying to get all employees as fallback...");
                            allEmployees = await _db.Employees.ToListAsync();
                            Console.WriteLine($"Found {allEmployees.Count} total employees");
                        }
                        catch (Exception allEx)
                        {
                            Console.WriteLine($"Fallback query failed: {allEx.Message}");
                            allEmployees = employees; // Use original list
                        }
                    }
                    
                    // Filter in memory with case-insensitive matching
                    Console.WriteLine($"Searching for email: '{email}' (case-insensitive)");
                    employee = allEmployees
                        .Where(e => 
                            e.Email != null && 
                            e.Password != null &&
                            e.Email.Trim().Equals(email, StringComparison.OrdinalIgnoreCase) &&
                            e.Password.Trim() == password)
                        .FirstOrDefault();
                    
                    if (employee != null)
                    {
                        Console.WriteLine($"✓✓✓ EMPLOYEE FOUND! ID: {employee.EmployeeId}, Name: {employee.FirstName} {employee.LastName}");
                        
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
                    // Employee login
                    var claims = new List<Claim>
                    {
                        new Claim(ClaimTypes.NameIdentifier, employee.EmployeeId.ToString()),
                        new Claim(ClaimTypes.Name, $"{employee.FirstName} {employee.LastName}"),
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
                            fullName = $"{employee.FirstName} {employee.LastName}",
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
                Console.WriteLine($"SignUp received - Email: {signUpDto?.Email}, FullName: {signUpDto?.FullName}, StoreId: {signUpDto?.StoreId}");

                if (signUpDto == null)
                {
                    return BadRequest(new { error = "Request body is required" });
                }

                if (string.IsNullOrWhiteSpace(signUpDto.Email) || 
                    string.IsNullOrWhiteSpace(signUpDto.Password) || 
                    string.IsNullOrWhiteSpace(signUpDto.FullName))
                {
                    return BadRequest(new { error = "Email, password, and full name are required" });
                }

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

                // Check if email already exists (check both Users and Employees)
                var existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Email == signUpDto.Email);
                var existingEmployee = await _db.Employees.FirstOrDefaultAsync(e => e.Email == signUpDto.Email);
                if (existingUser != null || existingEmployee != null)
                {
                    return Conflict(new { error = "Email already registered" });
                }

                // Verify store exists
                var store = await _db.Stores.FindAsync(signUpDto.StoreId);
                if (store == null)
                {
                    return BadRequest(new { error = $"Invalid store ID: {signUpDto.StoreId}. Please select a valid store." });
                }

                // Signup creates an Employee, not a User (User = Manager only)
                // Create Employee record with login credentials
                var nameParts = signUpDto.FullName.Trim().Split(' ', 2);
                var firstName = nameParts[0];
                var lastName = nameParts.Length > 1 ? nameParts[1] : "";

                var newEmployee = new Employee
                {
                    FirstName = firstName,
                    LastName = lastName,
                    Email = signUpDto.Email.Trim(),
                    Password = signUpDto.Password.Trim(), // NOTE: In production, hash this password
                    HourlyWage = 0, // Default wage
                    ProductivityScore = 5.0, // Default productivity score
                    StoreId = signUpDto.StoreId
                };

                Console.WriteLine($"Creating employee - Email: {newEmployee.Email}, Name: {newEmployee.FirstName} {newEmployee.LastName}, StoreId: {newEmployee.StoreId}");

                // Try EF Core first
                try
                {
                    _db.Employees.Add(newEmployee);
                    await _db.SaveChangesAsync();
                    Console.WriteLine($"Employee created successfully with ID: {newEmployee.EmployeeId}");
                }
                catch (Exception saveEx)
                {
                    // If EF Core fails, use raw SQL
                    if (saveEx.Message.Contains("required parameters") || 
                        saveEx.Message.Contains("unknown field name") ||
                        saveEx.Message.Contains("cannot find"))
                    {
                        Console.WriteLine($"⚠ EF Core insert failed: {saveEx.Message}. Trying raw SQL...");
                        _db.ChangeTracker.Clear();
                        
                        try
                        {
                            // Use raw SQL to insert directly
                            await _db.Database.ExecuteSqlRawAsync(
                                "INSERT INTO Employees (FirstName, LastName, Email, Password, HourlyWage, ProductivityScore, StoreId) VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6})",
                                newEmployee.FirstName,
                                newEmployee.LastName,
                                newEmployee.Email,
                                newEmployee.Password,
                                newEmployee.HourlyWage,
                                newEmployee.ProductivityScore,
                                newEmployee.StoreId
                            );
                            
                            // Fetch the inserted employee to get the ID
                            var insertedEmployee = await _db.Employees
                                .Where(e => e.Email == newEmployee.Email && e.StoreId == newEmployee.StoreId)
                                .FirstOrDefaultAsync();
                            
                            if (insertedEmployee != null)
                            {
                                newEmployee.EmployeeId = insertedEmployee.EmployeeId;
                                Console.WriteLine($"Employee created successfully via SQL with ID: {newEmployee.EmployeeId}");
                            }
                            else
                            {
                                Console.WriteLine("⚠ Employee inserted but could not retrieve ID");
                            }
                        }
                        catch (Exception sqlEx)
                        {
                            // Log detailed error information
                            Console.WriteLine($"SQL insert error: {sqlEx.Message}");
                            Console.WriteLine($"Inner exception: {sqlEx.InnerException?.Message}");
                            
                            return StatusCode(500, new 
                            { 
                                error = "Failed to create employee", 
                                message = $"Could not save employee. EF Core error: {saveEx.Message}. SQL error: {sqlEx.Message}",
                                details = sqlEx.InnerException?.Message ?? saveEx.InnerException?.Message
                            });
                        }
                    }
                    else
                    {
                        // Different error - re-throw
                        Console.WriteLine($"SaveChanges error: {saveEx.Message}");
                        Console.WriteLine($"Inner exception: {saveEx.InnerException?.Message}");
                        throw;
                    }
                }

                return Ok(new
                {
                    success = true,
                    message = "Account created successfully. Please login.",
                    user = new
                    {
                        userId = newEmployee.EmployeeId,
                        fullName = $"{newEmployee.FirstName} {newEmployee.LastName}",
                        email = newEmployee.Email,
                        storeId = newEmployee.StoreId,
                        storeName = store.Name,
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
                        fullName = $"{employee.FirstName} {employee.LastName}",
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
        public string FullName { get; set; } = string.Empty;
        public int StoreId { get; set; }
    }
}



using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StoresController : ControllerBase
    {
        private readonly AppData _db;

        public StoresController(AppData db)
        {
            _db = db;
        }

        // GET: api/Stores
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetStores()
        {
            try
            {
                Console.WriteLine("GET /api/stores - Starting request");
                
                // First check if we can connect
                bool canConnect = false;
                try
                {
                    canConnect = await _db.Database.CanConnectAsync();
                    Console.WriteLine($"Database connection check: {canConnect}");
                }
                catch (Exception connEx)
                {
                    Console.WriteLine($"⚠ Database connection check failed: {connEx.Message}");
                    // Continue - might still be able to query
                }

                if (!canConnect)
                {
                    Console.WriteLine("⚠ Cannot connect to database - returning empty array");
                    return Ok(new List<object>()); // Return empty array if can't connect
                }

                // Try to ensure tables exist
                try
                {
                    await _db.Database.EnsureCreatedAsync();
                    Console.WriteLine("✓ Database tables ensured");
                }
                catch (Exception ensureEx)
                {
                    Console.WriteLine($"⚠ EnsureCreated warning: {ensureEx.Message}");
                    // If EnsureCreated fails, continue anyway - tables might already exist
                }

                // Check if Stores table exists by trying to query it
                bool tableExists = false;
                try
                {
                    var testCount = await _db.Stores.CountAsync();
                    Console.WriteLine($"✓ Stores table exists with {testCount} records");
                    tableExists = true;
                }
                catch (Exception tableEx)
                {
                    Console.WriteLine($"⚠ Stores table check failed: {tableEx.Message}");
                    if (tableEx.Message.Contains("cannot find") || 
                        tableEx.Message.Contains("does not exist") ||
                        tableEx.Message.Contains("unknown field name"))
                    {
                        Console.WriteLine("⚠ Stores table doesn't exist or has wrong schema");
                        // Try to create it
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync(@"
                                CREATE TABLE Stores (
                                    StoreId AUTOINCREMENT PRIMARY KEY,
                                    Name TEXT(100) NOT NULL,
                                    Location TEXT(200),
                                    HourlySalesTarget DECIMAL(18,2),
                                    HourlyLaborBudget DECIMAL(18,2)
                                )
                            ");
                            Console.WriteLine("✓ Created Stores table");
                            tableExists = true;
                        }
                        catch (Exception createEx)
                        {
                            Console.WriteLine($"⚠ Could not create Stores table: {createEx.Message}");
                            // Return empty array - table creation failed
                            return Ok(new List<object>());
                        }
                    }
                    else
                    {
                        // Other error - might be database locked
                        if (tableEx.Message.Contains("exclusively") || tableEx.Message.Contains("already opened"))
                        {
                            return StatusCode(503, new
                            {
                                success = false,
                                error = "Database is locked",
                                message = "The database is currently open in Microsoft Access or another application. Please close it and try again."
                            });
                        }
                        // Return empty array for other errors
                        return Ok(new List<object>());
                    }
                }

                // Try to seed stores if none exist (only if table exists)
                if (tableExists)
                {
                    try
                    {
                        var storeCount = await _db.Stores.CountAsync();
                        Console.WriteLine($"Current store count: {storeCount}");
                        if (storeCount == 0)
                        {
                            Console.WriteLine("No stores found - seeding default stores...");
                            var storesToSeed = new List<Store>
                            {
                                new Store { Name = "Foot Locker - Times Square", Location = "Times Square, New York, NY", HourlySalesTarget = 5000, HourlyLaborBudget = 500 },
                                new Store { Name = "Foot Locker - Fifth Avenue", Location = "Fifth Avenue, New York, NY", HourlySalesTarget = 4500, HourlyLaborBudget = 450 },
                                new Store { Name = "Foot Locker - Brooklyn", Location = "Brooklyn, NY", HourlySalesTarget = 3500, HourlyLaborBudget = 350 },
                                new Store { Name = "Foot Locker - Queens", Location = "Queens, NY", HourlySalesTarget = 3000, HourlyLaborBudget = 300 },
                                new Store { Name = "Foot Locker - Manhattan", Location = "Manhattan, NY", HourlySalesTarget = 4000, HourlyLaborBudget = 400 }
                            };
                            
                            _db.Stores.AddRange(storesToSeed);
                            await _db.SaveChangesAsync();
                            Console.WriteLine($"✓ Seeded {storesToSeed.Count} stores");
                        }
                    }
                    catch (Exception seedEx)
                    {
                        Console.WriteLine($"⚠ Seeding failed (non-critical): {seedEx.Message}");
                        // If seeding fails, continue - might be locked or other issue
                    }
                }

                // Now fetch stores
                List<object> stores;
                try
                {
                    stores = await _db.Stores
                        .Select(s => new
                        {
                            StoreId = s.StoreId,
                            Name = s.Name,
                            Location = s.Location,
                            HourlySalesTarget = s.HourlySalesTarget,
                            HourlyLaborBudget = s.HourlyLaborBudget
                        })
                        .ToListAsync<object>();

                    Console.WriteLine($"✓ Successfully fetched {stores.Count} stores");
                    return Ok(stores);
                }
                catch (Exception fetchEx)
                {
                    Console.WriteLine($"⚠ Error fetching stores: {fetchEx.Message}");
                    // Return empty array instead of error
                    return Ok(new List<object>());
                }
            }
            catch (Exception ex)
            {
                // Log full error details
                Console.WriteLine("═══════════════════════════════════════");
                Console.WriteLine($"GET STORES ERROR: {ex.GetType().Name}");
                Console.WriteLine($"Message: {ex.Message}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner Exception: {ex.InnerException.GetType().Name}");
                    Console.WriteLine($"Inner Message: {ex.InnerException.Message}");
                }
                Console.WriteLine($"Stack Trace: {ex.StackTrace}");
                Console.WriteLine("═══════════════════════════════════════");
                
                // Always return valid JSON - prefer empty array over error
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
                    
                    // For all other errors, return empty array to prevent frontend crash
                    Console.WriteLine("⚠ Returning empty array due to error");
                    return Ok(new List<object>());
                }
                catch (Exception responseEx)
                {
                    // If even creating response fails, return minimal JSON
                    Console.WriteLine($"CRITICAL: Failed to create response: {responseEx.Message}");
                    Response.StatusCode = 200; // Use 200 to return valid JSON
                    Response.ContentType = "application/json";
                    await Response.WriteAsync("[]");
                    return new StatusCodeResult(200);
                }
            }
        }

        // GET: api/Stores/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetStore(int id)
        {
            try
            {
                var store = await _db.Stores
                    .Include(s => s.Employees)
                    .Include(s => s.Shifts)
                    .FirstOrDefaultAsync(s => s.StoreId == id);

                if (store == null)
                {
                    return NotFound(new { error = "Store not found" });
                }

                return Ok(new
                {
                    store.StoreId,
                    store.Name,
                    store.Location,
                    store.HourlySalesTarget,
                    store.HourlyLaborBudget,
                    EmployeeCount = store.Employees.Count,
                    ShiftCount = store.Shifts.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve store", message = ex.Message });
            }
        }

        // POST: api/Stores
        [HttpPost]
        [Authorize(Roles = "Manager")]
        public async Task<ActionResult<Store>> CreateStore([FromBody] CreateStoreDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var store = new Store
                {
                    Name = dto.Name,
                    Location = dto.Location,
                    HourlySalesTarget = dto.HourlySalesTarget,
                    HourlyLaborBudget = dto.HourlyLaborBudget
                };

                _db.Stores.Add(store);
                await _db.SaveChangesAsync();

                return CreatedAtAction(nameof(GetStore), new { id = store.StoreId }, store);
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
                return StatusCode(500, new { error = "Failed to create store", message = ex.Message });
            }
        }

        // POST: api/Stores/seed
        [HttpPost("seed")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> SeedStores()
        {
            try
            {
                // First ensure database and tables exist
                try
                {
                    var canConnect = await _db.Database.CanConnectAsync();
                    if (!canConnect)
                    {
                        return StatusCode(500, new { error = "Cannot connect to database", message = "Please check the database connection string." });
                    }

                    // Check if Stores table exists and has correct schema
                    bool needsRecreation = false;
                    try
                    {
                        // Try to query with all expected columns
                        var testQuery = await _db.Stores
                            .Select(s => new { s.StoreId, s.Name, s.Location, s.HourlySalesTarget, s.HourlyLaborBudget })
                            .Take(1)
                            .ToListAsync();
                        Console.WriteLine("✓ Stores table exists with correct schema");
                    }
                    catch (Exception schemaEx)
                    {
                        // Any error means wrong schema or table doesn't exist
                        if (schemaEx.Message.Contains("unknown field name") || 
                            schemaEx.Message.Contains("Name") || 
                            schemaEx.Message.Contains("HourlyLaborBudget") ||
                            schemaEx.Message.Contains("does not exist"))
                        {
                            Console.WriteLine("⚠ Stores table has wrong schema or doesn't exist. Dropping and recreating it.");
                            needsRecreation = true;
                        }
                        else
                        {
                            Console.WriteLine($"⚠ Schema check error: {schemaEx.Message}");
                            needsRecreation = true; // Better safe than sorry
                        }
                    }

                    // If table needs recreation, drop it first
                    if (needsRecreation)
                    {
                        try
                        {
                            // Try to drop the table - Access syntax
                            await _db.Database.ExecuteSqlRawAsync("DROP TABLE Stores");
                            Console.WriteLine("✓ Dropped old Stores table");
                        }
                        catch (Exception dropEx)
                        {
                            // Table might not exist, or we need to handle foreign keys
                            Console.WriteLine($"⚠ Could not drop table (might not exist): {dropEx.Message}");
                            // Try to delete all data first if table exists
                            try
                            {
                                await _db.Database.ExecuteSqlRawAsync("DELETE FROM Stores");
                                Console.WriteLine("✓ Cleared Stores table data");
                            }
                            catch { }
                        }
                    }

                    // Ensure tables exist - this will create them with correct schema
                    try
                    {
                        await _db.Database.EnsureCreatedAsync();
                        Console.WriteLine("✓ Database tables ensured with correct schema");
                    }
                    catch (Exception ensureEx)
                    {
                        Console.WriteLine($"⚠ EnsureCreated warning: {ensureEx.Message}");
                        // Continue - we'll verify and create manually if needed
                    }
                    
                    // Verify Stores table exists by trying to query it
                    bool tableExists = false;
                    try
                    {
                        var testCount = await _db.Stores.CountAsync();
                        Console.WriteLine($"✓ Stores table verified (has {testCount} records)");
                        tableExists = true;
                    }
                    catch (Exception verifyEx)
                    {
                        if (verifyEx.Message.Contains("cannot find") || 
                            verifyEx.Message.Contains("does not exist") ||
                            verifyEx.Message.Contains("unknown field name"))
                        {
                            Console.WriteLine("⚠ Stores table doesn't exist or has wrong schema. Creating it manually...");
                            tableExists = false;
                        }
                        else
                        {
                            Console.WriteLine($"⚠ Verification error: {verifyEx.Message}");
                            tableExists = false;
                        }
                    }
                    
                    // If table doesn't exist, create it manually
                    if (!tableExists)
                    {
                        try
                        {
                            // Create the table manually using Access/Jet SQL syntax
                            await _db.Database.ExecuteSqlRawAsync(@"
                                CREATE TABLE Stores (
                                    StoreId AUTOINCREMENT PRIMARY KEY,
                                    Name TEXT(100) NOT NULL,
                                    Location TEXT(200),
                                    HourlySalesTarget DECIMAL(18,2),
                                    HourlyLaborBudget DECIMAL(18,2)
                                )
                            ");
                            Console.WriteLine("✓ Created Stores table manually with correct schema");
                        }
                        catch (Exception createEx)
                        {
                            // Table might already exist with different name or structure
                            Console.WriteLine($"⚠ Could not create table: {createEx.Message}");
                            // Try to continue anyway - maybe table exists with different structure
                        }
                    }
                }
                catch (Exception dbEx)
                {
                    if (dbEx.Message.Contains("exclusively") || dbEx.Message.Contains("already opened"))
                    {
                        return StatusCode(503, new
                        {
                            error = "Database is locked",
                            message = "The database is currently open in Microsoft Access or another application. Please close it and try again."
                        });
                    }
                    return StatusCode(500, new { error = "Database setup failed", message = dbEx.Message, details = dbEx.InnerException?.Message });
                }

                // Check if stores already exist (table should exist now)
                int existingStores = 0;
                try
                {
                    existingStores = await _db.Stores.CountAsync();
                }
                catch (Exception countEx)
                {
                    // If table still doesn't exist, that's a problem
                    if (countEx.Message.Contains("cannot find") || countEx.Message.Contains("does not exist"))
                    {
                        return StatusCode(500, new 
                        { 
                            error = "Table creation failed", 
                            message = "Could not create or access Stores table. Please check database permissions and ensure Microsoft Access is closed." 
                        });
                    }
                    throw;
                }
                
                if (existingStores > 0)
                {
                    return Ok(new { message = $"Database already has {existingStores} store(s). No seeding needed." });
                }

                // Store data to insert
                var storesData = new[]
                {
                    new { Name = "Foot Locker - Times Square", Location = "Times Square, New York, NY", HourlySalesTarget = 5000m, HourlyLaborBudget = 500m },
                    new { Name = "Foot Locker - Fifth Avenue", Location = "Fifth Avenue, New York, NY", HourlySalesTarget = 4500m, HourlyLaborBudget = 450m },
                    new { Name = "Foot Locker - Brooklyn", Location = "Brooklyn, NY", HourlySalesTarget = 3500m, HourlyLaborBudget = 350m },
                    new { Name = "Foot Locker - Queens", Location = "Queens, NY", HourlySalesTarget = 3000m, HourlyLaborBudget = 300m },
                    new { Name = "Foot Locker - Manhattan", Location = "Manhattan, NY", HourlySalesTarget = 4000m, HourlyLaborBudget = 400m }
                };

                // Use EF Core to insert - table should now have correct schema
                var createdCount = 0;
                foreach (var store in storesData)
                {
                    try
                    {
                        var newStore = new Store
                        {
                            Name = store.Name,
                            Location = store.Location,
                            HourlySalesTarget = store.HourlySalesTarget,
                            HourlyLaborBudget = store.HourlyLaborBudget
                        };
                        
                        _db.Stores.Add(newStore);
                        await _db.SaveChangesAsync();
                        _db.ChangeTracker.Clear();
                        createdCount++;
                        Console.WriteLine($"✓ Created store: {store.Name}");
                    }
                    catch (Exception efEx)
                    {
                        // If EF Core fails, try raw SQL as fallback
                        var innerMsg = efEx.InnerException?.Message ?? efEx.Message;
                        Console.WriteLine($"⚠ EF Core insert failed: {innerMsg}. Trying raw SQL...");
                        
                        try
                        {
                            // Use raw SQL with proper column names (EF Core should have created them correctly)
                            await _db.Database.ExecuteSqlRawAsync(
                                "INSERT INTO Stores (Name, Location, HourlySalesTarget, HourlyLaborBudget) VALUES ({0}, {1}, {2}, {3})",
                                store.Name,
                                store.Location ?? "",
                                store.HourlySalesTarget,
                                store.HourlyLaborBudget
                            );
                            createdCount++;
                            Console.WriteLine($"✓ Created store via SQL: {store.Name}");
                        }
                        catch (Exception sqlEx)
                        {
                            var sqlInnerMsg = sqlEx.InnerException?.Message ?? sqlEx.Message;
                            throw new Exception($"Failed to create store '{store.Name}' (EF: {innerMsg}, SQL: {sqlInnerMsg})", sqlEx);
                        }
                    }
                }
                
                // Fetch created stores to return
                var createdStores = await _db.Stores
                    .Select(s => new { s.StoreId, s.Name, s.Location })
                    .ToListAsync();

                return Ok(new
                {
                    success = true,
                    message = $"Successfully created {createdCount} stores",
                    stores = createdStores
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
                
                // Get inner exception details for better error reporting
                var errorMessage = ex.Message;
                var innerException = ex.InnerException?.Message ?? "";
                var fullError = $"{errorMessage} {innerException}".Trim();
                
                Console.WriteLine($"Error seeding stores: {fullError}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                
                return StatusCode(500, new 
                { 
                    error = "Failed to seed stores", 
                    message = fullError,
                    details = ex.InnerException?.ToString() ?? ex.ToString()
                });
            }
        }
    }

    public class CreateStoreDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Location { get; set; }
        public decimal HourlySalesTarget { get; set; }
        public decimal HourlyLaborBudget { get; set; }
    }
}




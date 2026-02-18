using Backend.Models;
using EntityFrameworkCore.Jet;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using System.Net;

namespace Backend
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllersWithViews()
                .AddJsonOptions(options =>
                {
                    // Ensure JSON serialization works properly
                    options.JsonSerializerOptions.PropertyNamingPolicy = null; // Use PascalCase
                    options.JsonSerializerOptions.WriteIndented = false;
                });

            // Add CORS to allow frontend to call backend API
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowFrontend", policy =>
                {
                    policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
                          .AllowAnyHeader()
                          .AllowAnyMethod()
                          .AllowCredentials();
                });
            });

            // Database: AppData with Access / Jet
            var connectionString = builder.Configuration.GetConnectionString("ShiftlyConnection")
                ?? "Data Source=..\\..\\..\\..\\DB\\ShiftlyDB.accdb";

            // Configure DbContext with proper connection management for Access
            builder.Services.AddDbContext<AppData>(options =>
            {
                options.UseJet(connectionString);
                // Disable connection pooling for Access to avoid lock issues
                options.EnableServiceProviderCaching(false);
            }, ServiceLifetime.Scoped);

            // Authentication: simple cookie auth for store managers
            builder.Services
                .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
                .AddCookie(options =>
                {
                    options.LoginPath = "/Account/Login";
                    options.LogoutPath = "/Account/Logout";
                    options.AccessDeniedPath = "/Account/AccessDenied";
                });

            builder.Services.AddAuthorization();

            var app = builder.Build();

            // Ensure database and tables exist (best-effort)
            // Note: We skip EnsureCreated if database is locked to avoid errors
            try
            {
                using var scope = app.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppData>();
                
                // Test connection with a simple query instead of EnsureCreated
                // This avoids locking issues if database is already open
                try
                {
                    var canConnect = await db.Database.CanConnectAsync();
                    if (canConnect)
                    {
                        // Ensure tables exist (best effort)
                        try
                        {
                            await db.Database.EnsureCreatedAsync();
                            Console.WriteLine("✓ Database tables ensured");
                        }
                        catch (Exception ensureEx)
                        {
                            Console.WriteLine($"⚠ EnsureCreated warning: {ensureEx.Message}");
                            // Continue anyway - tables might already exist
                            
                            // Try to manually create Users table if EnsureCreated didn't work
                            try
                            {
                                var testUsers = await db.Users.CountAsync();
                                Console.WriteLine($"✓ Users table exists (has {testUsers} records)");
                            }
                            catch (Exception usersEx)
                            {
                                if (usersEx.Message.Contains("cannot find") || usersEx.Message.Contains("does not exist"))
                                {
                                    Console.WriteLine("⚠ Users table doesn't exist. Creating it manually...");
                                    try
                                    {
                                        await db.Database.ExecuteSqlRawAsync(@"
                                            CREATE TABLE Users (
                                                UserId AUTOINCREMENT PRIMARY KEY,
                                                Email TEXT(200) NOT NULL,
                                                FullName TEXT(100) NOT NULL,
                                                Password TEXT(200) NOT NULL,
                                                StoreId INTEGER NOT NULL,
                                                Role TEXT(20) NOT NULL
                                            )
                                        ");
                                        Console.WriteLine("✓ Created Users table manually");
                                    }
                                    catch (Exception createUsersEx)
                                    {
                                        Console.WriteLine($"⚠ Could not create Users table: {createUsersEx.Message}");
                                    }
                                }
                            }
                        }
                        
                        // Seed stores if database is empty (best effort)
                        try
                        {
                            var storeCount = await db.Stores.CountAsync();
                            if (storeCount == 0)
                            {
                                var stores = new List<Store>
                                {
                                    new Store { Name = "Foot Locker - Times Square", Location = "Times Square, New York, NY", HourlySalesTarget = 5000, HourlyLaborBudget = 500 },
                                    new Store { Name = "Foot Locker - Fifth Avenue", Location = "Fifth Avenue, New York, NY", HourlySalesTarget = 4500, HourlyLaborBudget = 450 },
                                    new Store { Name = "Foot Locker - Brooklyn", Location = "Brooklyn, NY", HourlySalesTarget = 3500, HourlyLaborBudget = 350 },
                                    new Store { Name = "Foot Locker - Queens", Location = "Queens, NY", HourlySalesTarget = 3000, HourlyLaborBudget = 300 },
                                    new Store { Name = "Foot Locker - Manhattan", Location = "Manhattan, NY", HourlySalesTarget = 4000, HourlyLaborBudget = 400 }
                                };
                                
                                db.Stores.AddRange(stores);
                                await db.SaveChangesAsync();
                                Console.WriteLine($"✓ Seeded {stores.Count} stores");
                            }
                            else
                            {
                                Console.WriteLine($"✓ Found {storeCount} existing store(s)");
                            }
                        }
                        catch (Exception seedEx)
                        {
                            Console.WriteLine($"⚠ Store seeding warning: {seedEx.Message}");
                            // Continue anyway - might be locked or other issue
                        }

                        // Seed default manager user if none exists
                        try
                        {
                            var userCount = await db.Users.CountAsync();
                            Console.WriteLine($"Current user count: {userCount}");
                            
                            if (userCount == 0)
                            {
                                // Get first store for the manager (or create one if none exist)
                                var firstStore = await db.Stores.FirstOrDefaultAsync();
                                int storeId;
                                
                                if (firstStore == null)
                                {
                                    // Create a default store if none exists
                                    var defaultStore = new Store
                                    {
                                        Name = "Default Store",
                                        Location = "Default Location",
                                        HourlySalesTarget = 3000,
                                        HourlyLaborBudget = 300
                                    };
                                    db.Stores.Add(defaultStore);
                                    await db.SaveChangesAsync();
                                    storeId = defaultStore.StoreId;
                                    Console.WriteLine($"✓ Created default store (ID: {storeId}) for manager");
                                }
                                else
                                {
                                    storeId = firstStore.StoreId;
                                }
                                
                                var defaultManager = new User
                                {
                                    Email = "manager@shiftly.com",
                                    FullName = "Default Manager",
                                    Password = "manager123", // Default password
                                    StoreId = storeId
                                };
                                
                                db.Users.Add(defaultManager);
                                await db.SaveChangesAsync();
                                Console.WriteLine("✓ Created default manager user");
                                Console.WriteLine("   Email: manager@shiftly.com");
                                Console.WriteLine("   Password: manager123");
                                Console.WriteLine($"   StoreId: {storeId}");
                            }
                            else
                            {
                                // Check if manager exists
                                var manager = await db.Users.FirstOrDefaultAsync(u => u.Email == "manager@shiftly.com");
                                if (manager != null)
                                {
                                    Console.WriteLine($"✓ Manager user already exists (ID: {manager.UserId})");
                                }
                                else
                                {
                                    Console.WriteLine("⚠ Manager user not found, but other users exist");
                                }
                            }
                        }
                        catch (Exception managerEx)
                        {
                            Console.WriteLine($"⚠ Manager seeding error: {managerEx.Message}");
                            Console.WriteLine($"⚠ Stack trace: {managerEx.StackTrace}");
                        }
                        
                        Console.WriteLine("✓ Database connection successful");
                    }
                    else
                    {
                        Console.WriteLine("⚠ Database file not found or cannot be accessed");
                    }
                }
                catch (Exception dbEx)
                {
                    if (dbEx.Message.Contains("exclusively") || dbEx.Message.Contains("already opened"))
                    {
                        Console.WriteLine("⚠ Database is locked. Please close Microsoft Access if it's open.");
                        Console.WriteLine("   The application will continue, but database operations may fail.");
                    }
                    else
                    {
                        Console.WriteLine($"⚠ Database connection warning: {dbEx.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ Database initialization error: {ex.Message}");
            }

            // Configure the HTTP request pipeline.
            // Global exception handler to ensure all errors return JSON
            app.UseExceptionHandler(errorApp =>
            {
                errorApp.Run(async context =>
                {
                    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    context.Response.ContentType = "application/json";

                    var exceptionHandlerPathFeature = context.Features.Get<IExceptionHandlerPathFeature>();
                    var exception = exceptionHandlerPathFeature?.Error;

                    Console.WriteLine($"═══════════════════════════════════════");
                    Console.WriteLine($"UNHANDLED EXCEPTION: {exception?.GetType().Name}");
                    Console.WriteLine($"Message: {exception?.Message}");
                    if (exception?.InnerException != null)
                    {
                        Console.WriteLine($"Inner Exception: {exception.InnerException.GetType().Name}");
                        Console.WriteLine($"Inner Message: {exception.InnerException.Message}");
                    }
                    Console.WriteLine($"Stack Trace: {exception?.StackTrace}");
                    Console.WriteLine($"═══════════════════════════════════════");

                    await context.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        error = "Internal Server Error",
                        message = exception?.Message ?? "An unexpected error occurred",
                        details = exception?.InnerException?.Message ?? exception?.ToString()
                    });
                });
            });

            if (!app.Environment.IsDevelopment())
            {
                app.UseHsts();
            }

            app.UseHttpsRedirection();
            app.UseStaticFiles();

            app.UseRouting();

            // Enable CORS before authentication
            app.UseCors("AllowFrontend");

            app.UseAuthentication();
            app.UseAuthorization();

            app.MapControllerRoute(
                name: "default",
                pattern: "{controller=Home}/{action=Index}/{id?}");

            await app.RunAsync();
        }
    }
}

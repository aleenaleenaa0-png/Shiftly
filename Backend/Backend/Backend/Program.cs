// =============================================================================
// Program.cs — نقطة تشغيل السيرفر (Backend)
// =============================================================================
// ما يحدث عند التشغيل:
// 1) الاتصال بملف Access (ShiftlyDB.accdb)
// 2) إنشاء مدير افتراضي إن لم يوجد
// 3) إنشاء 14 مناوبة للأسبوع الحالي
// 4) فتح API للواجهة الأمامية (CORS + Cookies)
//
// للمختبر: إن ظهر "Database is locked" — أغلق Microsoft Access.
// =============================================================================

using Backend.Models;
using Backend.Services;
using EntityFrameworkCore.Jet;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using System.Data.OleDb;
using System.Net;

namespace Backend
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // إعداد Access: جدول Dual مطلوب لمحرك Jet (تفاصيل تقنية — لا يحتاج اختبار يدوي)
            var connectionString = builder.Configuration.GetConnectionString("ShiftlyConnection")
                ?? "Data Source=C:\\Users\\aleen\\Documents\\ShiftlyDB.accdb";
            EnsureDualTableExists(connectionString);
            SetJetDualToTableDual();

            // Add services to the container.
            builder.Services.AddControllersWithViews()
                .AddJsonOptions(options =>
                {
                    options.JsonSerializerOptions.PropertyNamingPolicy = null;
                    options.JsonSerializerOptions.WriteIndented = false;
                    // Frontend sends camelCase (e.g. slotNumber); accept it for model binding
                    options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
                });

            // السماح للواجهة (React على المنفذ 5173 أو 3000) بالاتصال بالـ API
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

            Console.WriteLine($"✓ Database connection: {connectionString}");

            // ربط Entity Framework بقاعدة Access
            builder.Services.AddDbContext<AppData>(options =>
            {
                options.UseJet(connectionString);
                // Disable connection pooling for Access to avoid lock issues
                options.EnableServiceProviderCaching(false);
            }, ServiceLifetime.Scoped);

            // تسجيل الدخول عبر Cookie (يُرسل مع كل طلب من المتصفح بعد Login)
            builder.Services
                .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
                .AddCookie(options =>
                {
                    options.LoginPath = "/Account/Login";
                    options.LogoutPath = "/Account/Logout";
                    options.AccessDeniedPath = "/Account/AccessDenied";
                });

            builder.Services.AddAuthorization(options =>
            {
                // Policy for Manager-only access
                options.AddPolicy("ManagerOnly", policy =>
                {
                    policy.RequireRole("Manager");
                });
            });

            var app = builder.Build();

            // ─── عند بدء التشغيل: تجهيز قاعدة البيانات ───
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
                                                Password TEXT(200) NOT NULL
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
                        
                        try
                        {
                            // حساب المدير الافتراضي للاختبار الأول
                            if (!await db.Users.AnyAsync())
                            {
                                db.Users.Add(new User
                                {
                                    Email = "manager@shiftly.com",
                                    FullName = "Default Manager",
                                    Password = "manager123"
                                });
                                await db.SaveChangesAsync();
                                Console.WriteLine("✓ Created default manager (manager@shiftly.com / manager123)");
                            }
                        }
                        catch (Exception managerEx)
                        {
                            Console.WriteLine($"⚠ Manager seeding warning: {managerEx.Message}");
                        }

                        try
                        {
                            // إنشاء 14 مناوبة أسبوعية (ويُفرَّغ التوفر عند forceReset: true)
                            await ShiftBootstrap.ResetAndSeedCurrentWeekAsync(db, connectionString, forceReset: true);
                        }
                        catch (Exception shiftEx)
                        {
                            Console.WriteLine($"⚠ Shift bootstrap warning: {shiftEx.Message}");
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

        /// <summary>Create a physical "Dual" table in Access (one row). EF Core Jet needs this; otherwise you get "cannot find #Dual".</summary>
        private static void EnsureDualTableExists(string connectionString)
        {
            try
            {
                var oledb = connectionString.Trim();
                if (!oledb.Contains("Provider=", StringComparison.OrdinalIgnoreCase))
                    oledb = "Provider=Microsoft.ACE.OLEDB.12.0;" + (oledb.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase) ? oledb : "Data Source=" + oledb) + ";";
                using var conn = new OleDbConnection(oledb);
                conn.Open();
                using var cmd = conn.CreateCommand();
                bool tableExists = false;
                try
                {
                    cmd.CommandText = "SELECT COUNT(*) FROM [Dual]";
                    cmd.ExecuteScalar();
                    tableExists = true;
                }
                catch { /* table missing */ }
                if (!tableExists)
                {
                    cmd.CommandText = "CREATE TABLE [Dual] (id AUTOINCREMENT PRIMARY KEY)";
                    cmd.ExecuteNonQuery();
                    cmd.CommandText = "INSERT INTO [Dual] (id) VALUES (1)";
                    cmd.ExecuteNonQuery();
                    Console.WriteLine("✓ Dual table created in Access");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Dual table (non-fatal): {ex.Message}");
            }
        }

        /// <summary>Set Jet DUAL to use the physical "Dual" table so EF Core stops looking for #Dual.</summary>
        private static void SetJetDualToTableDual()
        {
            try
            {
                var asm = System.Reflection.Assembly.Load(new System.Reflection.AssemblyName("EntityFrameworkCore.Jet"));
                var jetConfig = asm.GetType("EntityFrameworkCore.Jet.Infrastructure.JetConfiguration")
                    ?? asm.GetTypes().FirstOrDefault(t => t.Name == "JetConfiguration");
                if (jetConfig != null)
                {
                    var dualProp = jetConfig.GetProperty("DUAL", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
                    if (dualProp != null)
                    {
                        dualProp.SetValue(null, "Dual");
                        Console.WriteLine("✓ Jet DUAL set to table 'Dual'");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Jet DUAL config (non-fatal): {ex.Message}");
            }
        }
    }
}

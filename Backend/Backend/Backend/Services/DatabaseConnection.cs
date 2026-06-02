using System.Data.OleDb;

using Microsoft.Extensions.Configuration;



namespace Backend.Services

{

    /// <summary>Single Access file only: Backend/DB/ShiftlyDB.accdb — no copies, no fallback.</summary>

    public static class DatabaseConnection

    {

        public static string Resolve(IConfiguration config)

        {

            var primaryRaw = config.GetConnectionString("ShiftlyConnection")

                ?? DatabasePaths.DefaultConnectionString;

            var accessPassword = config["Database:AccessPassword"];

            var primaryPath = GetFilePath(primaryRaw);

            var built = ShiftBootstrap.NormalizeOleDbConnectionString(primaryRaw, accessPassword);



            if (!File.Exists(primaryPath))

            {

                throw new InvalidOperationException(

                    $"Database file not found: {primaryPath}. Expected ShiftlyDB.accdb in Backend/DB.");

            }



            if (!CanOpen(built))

            {

                throw new InvalidOperationException(

                    $"Cannot open {primaryPath}. Close Microsoft Access completely. " +

                    "If the file has a password: File → Decrypt Database, or set Database:AccessPassword in appsettings.json.");

            }



            Console.WriteLine($"✓ Database: {primaryPath}");

            return built;

        }



        public static string GetFilePath(string connectionOrPath)

        {

            if (connectionOrPath.Contains("Data Source=", StringComparison.OrdinalIgnoreCase))

                return GetDataSource(connectionOrPath);

            return connectionOrPath.Trim();

        }



        public static string GetDataSource(string connectionString)

        {

            try

            {

                var b = new OleDbConnectionStringBuilder(connectionString);

                return b.DataSource ?? connectionString;

            }

            catch

            {

                return connectionString;

            }

        }



        public static void WriteActiveDatabaseMarker(string connectionString, int? lastEmployeeId, string? lastEmail)

        {

            try

            {

                var path = GetDataSource(connectionString);

                var dir = Path.GetDirectoryName(path);

                if (string.IsNullOrEmpty(dir)) return;



                var markerPath = Path.Combine(dir, "OPEN_THIS_FILE_IN_ACCESS.txt");

                var count = 0;

                try

                {

                    using var conn = new OleDbConnection(connectionString);

                    conn.Open();

                    using var cmd = conn.CreateCommand();

                    cmd.CommandText = "SELECT COUNT(*) FROM [Employees]";

                    count = Convert.ToInt32(cmd.ExecuteScalar());

                }

                catch { /* ignore */ }



                var text = $"""

                    SHIFTLY — OPEN THIS EXACT FILE IN MICROSOFT ACCESS

                    ====================================================



                    {path}



                    Employees in database right now: {count}

                    {(lastEmployeeId.HasValue ? $"Last sign-up: EmployeeId={lastEmployeeId}, Email={lastEmail}" : "")}



                    In Access: open this .accdb file directly (not External Data import).

                    After sign-up: close the Employees table tab and reopen it, or press F5.



                    Wrong file = empty table. The app only updates this path.

                    """;

                File.WriteAllText(markerPath, text);

            }

            catch (Exception ex)

            {

                Console.WriteLine($"⚠ Could not write database marker file: {ex.Message}");

            }

        }



        private static bool CanOpen(string connectionString)

        {

            try

            {

                using var conn = new OleDbConnection(connectionString);

                conn.Open();

                return true;

            }

            catch

            {

                return false;

            }

        }

    }



}



using System.Data.OleDb;
using Microsoft.Extensions.Configuration;

namespace Backend.Services
{
    /// <summary>
    /// All employee reads/writes go through this class — direct OLE DB to ShiftlyDB.accdb only.
    /// </summary>
    public sealed class AccessEmployeeStore
    {
        private readonly string _connectionString;
        private readonly string _filePath;

        public AccessEmployeeStore(IConfiguration config)
        {
            _filePath = DatabaseConnection.GetFilePath(
                config.GetConnectionString("ShiftlyConnection")
                ?? DatabasePaths.DefaultAccessDbPath);
            _connectionString = ShiftBootstrap.NormalizeOleDbConnectionString(
                $"Data Source={_filePath}");
        }

        public string FilePath => _filePath;

        public void EnsureDatabaseReady()
        {
            if (!File.Exists(_filePath))
                throw new InvalidOperationException($"Database file not found: {_filePath}");

            using var conn = Open();
            if (!TableExists(conn, "Employees"))
            {
                CreateEmployeesTable(conn);
                Console.WriteLine("✓ Created Employees table in Access database");
            }

            AccessSchemaHelper.EnsureEmployeeAuthColumns(_connectionString);
            var schema = EmployeeTableSchema.Load(_connectionString);
            EmployeeColumnConfig.ProductivityColumnName = schema.ProductivityColumn;

            if (!ColumnExists(conn, "Employees", schema.ProductivityColumn))
            {
                using var alter = conn.CreateCommand();
                alter.CommandText = schema.ProductivityColumn == "Productivity"
                    ? "ALTER TABLE [Employees] ADD COLUMN [Productivity] DOUBLE"
                    : "ALTER TABLE [Employees] ADD COLUMN [ProductivityScore] DOUBLE";
                alter.ExecuteNonQuery();
            }

            DatabaseConnection.WriteActiveDatabaseMarker(_connectionString, null, null);
        }

        public bool IsDatabaseLocked()
        {
            try
            {
                using var conn = new OleDbConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE [Employees] SET [FirstName] = [FirstName] WHERE 1=0";
                cmd.ExecuteNonQuery();
                return false;
            }
            catch (Exception ex)
            {
                var msg = ex.Message + (ex.InnerException?.Message ?? "");
                return msg.Contains("locked", StringComparison.OrdinalIgnoreCase)
                    || msg.Contains("in use", StringComparison.OrdinalIgnoreCase)
                    || msg.Contains("exclusively", StringComparison.OrdinalIgnoreCase)
                    || msg.Contains("already opened", StringComparison.OrdinalIgnoreCase)
                    || msg.Contains("פותח", StringComparison.OrdinalIgnoreCase);
            }
        }

        public bool EmailExists(string email)
        {
            EnsureDatabaseReady();
            return AccessSchemaHelper.EmployeeEmailExists(_connectionString, email);
        }

        public int? Insert(string firstName, string email, string password)
        {
            if (IsDatabaseLocked())
                throw new InvalidOperationException(
                    "Microsoft Access has the database file open. Close Access completely, then sign up again.");

            EnsureDatabaseReady();
            var id = AccessSchemaHelper.InsertEmployee(_connectionString, firstName, email, password);
            if (!id.HasValue)
                throw new InvalidOperationException("Insert returned no employee id.");

            if (!AccessSchemaHelper.VerifyEmployeeSaved(_connectionString, id.Value, firstName, email, password))
                throw new InvalidOperationException("Employee was not saved correctly to the database.");

            return id.Value;
        }

        public (int EmployeeId, string FirstName, string Email)? FindByEmailPassword(string email, string password) =>
            AccessSchemaHelper.FindEmployeeByEmailPassword(_connectionString, email, password);

        public List<Dictionary<string, object?>> ListAll()
        {
            EnsureDatabaseReady();
            return AccessSchemaHelper.ListEmployees(_connectionString);
        }

        public int Count()
        {
            using var conn = Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM [Employees]";
            return Convert.ToInt32(cmd.ExecuteScalar());
        }

        public int CreateManagerEmployee(string firstName, decimal hourlyWage, double productivityScore, string? email)
        {
            if (IsDatabaseLocked())
                throw new InvalidOperationException("Close Microsoft Access, then try again.");
            EnsureDatabaseReady();
            var schema = EmployeeTableSchema.Load(_connectionString);
            var prodCol = schema.ProductivityColumn;
            using var conn = Open();
            using var cmd = conn.CreateCommand();
            var cols = new List<string> { "FirstName", "HourlyWage", prodCol };
            var vals = new List<string> { "?", "?", "?" };
            cmd.Parameters.AddWithValue("@n", firstName);
            cmd.Parameters.AddWithValue("@w", hourlyWage);
            cmd.Parameters.AddWithValue("@p", productivityScore);
            if (schema.HasEmail && !string.IsNullOrWhiteSpace(email))
            {
                cols.Add("Email");
                vals.Add("?");
                cmd.Parameters.AddWithValue("@e", email.Trim());
            }
            cmd.CommandText = $"INSERT INTO [Employees] ([{string.Join("], [", cols)}]) VALUES ({string.Join(", ", vals)})";
            cmd.ExecuteNonQuery();
            using var idCmd = conn.CreateCommand();
            idCmd.CommandText = "SELECT @@IDENTITY";
            var id = Convert.ToInt32(idCmd.ExecuteScalar());
            DatabaseConnection.WriteActiveDatabaseMarker(_connectionString, id, email);
            return id;
        }

        public bool Update(int id, string firstName, decimal hourlyWage, double productivityScore, string? email)
        {
            if (IsDatabaseLocked()) return false;
            EnsureDatabaseReady();
            var schema = EmployeeTableSchema.Load(_connectionString);
            using var conn = Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = schema.HasEmail
                ? $"UPDATE [Employees] SET [FirstName]=?, [HourlyWage]=?, [{schema.ProductivityColumn}]=?, [Email]=? WHERE [EmployeeId]=?"
                : $"UPDATE [Employees] SET [FirstName]=?, [HourlyWage]=?, [{schema.ProductivityColumn}]=? WHERE [EmployeeId]=?";
            cmd.Parameters.AddWithValue("@n", firstName);
            cmd.Parameters.AddWithValue("@w", hourlyWage);
            cmd.Parameters.AddWithValue("@p", productivityScore);
            if (schema.HasEmail)
                cmd.Parameters.AddWithValue("@e", email?.Trim() ?? "");
            cmd.Parameters.AddWithValue("@id", id);
            return cmd.ExecuteNonQuery() > 0;
        }

        public bool Delete(int id)
        {
            if (IsDatabaseLocked()) return false;
            using var conn = Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM [Employees] WHERE [EmployeeId]=?";
            cmd.Parameters.AddWithValue("@id", id);
            return cmd.ExecuteNonQuery() > 0;
        }

        private OleDbConnection Open()
        {
            var conn = new OleDbConnection(_connectionString);
            conn.Open();
            return conn;
        }

        private static void CreateEmployeesTable(OleDbConnection conn)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE [Employees] (
                    [EmployeeId] AUTOINCREMENT PRIMARY KEY,
                    [FirstName] TEXT(100),
                    [HourlyWage] DECIMAL(18,2),
                    [ProductivityScore] DOUBLE,
                    [Email] TEXT(255),
                    [Password] TEXT(255),
                    [UserPassword] TEXT(255)
                )
                """;
            cmd.ExecuteNonQuery();
        }

        private static bool TableExists(OleDbConnection conn, string name)
        {
            var schema = conn.GetSchema("Tables", new[] { null, null, name, "TABLE" });
            return schema.Rows.Count > 0;
        }

        private static bool ColumnExists(OleDbConnection conn, string table, string column)
        {
            var schema = conn.GetSchema("Columns", new[] { null, null, table, column });
            return schema.Rows.Count > 0;
        }
    }
}

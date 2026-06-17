// =============================================================================
// AccessSchemaHelper — Access tables + employee CRUD via OleDb (same DB file)
// =============================================================================

using System.Data;
using System.Data.OleDb;

namespace Backend.Services
{
    public static class AccessSchemaHelper
    {
        public static bool EnsureUsersTable(string? connectionString)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                if (TableExists(conn, "Users"))
                {
                    if (HasUsersSchema(conn))
                    {
                        Console.WriteLine("✓ Users table exists with expected columns");
                        return true;
                    }
                    Console.WriteLine("⚠ Users table exists but is missing expected columns");
                    return false;
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = """
                    CREATE TABLE [Users] (
                        [UserId] AUTOINCREMENT PRIMARY KEY,
                        [Email] TEXT(255),
                        [FullName] TEXT(100),
                        [Password] TEXT(255)
                    )
                    """;
                cmd.ExecuteNonQuery();
                Console.WriteLine("✓ Created Users table");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ EnsureUsersTable failed: {ex.Message}");
                return false;
            }
        }

        public static List<Dictionary<string, object?>> ListUsers(string? connectionString)
        {
            var list = new List<Dictionary<string, object?>>();
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                EnsureUsersTable(connectionString);
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT [UserId], [Email], [FullName] FROM [Users] ORDER BY [UserId]";
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    list.Add(new Dictionary<string, object?>
                    {
                        ["UserId"] = reader.GetInt32(0),
                        ["Email"] = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        ["FullName"] = reader.IsDBNull(2) ? "" : reader.GetString(2)
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ ListUsers: {ex.Message}");
                throw;
            }
            return list;
        }

        public static Dictionary<string, object?>? GetUserById(string? connectionString, int userId)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                EnsureUsersTable(connectionString);
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT [UserId], [Email], [FullName] FROM [Users] WHERE [UserId] = ?";
                cmd.Parameters.AddWithValue("@id", userId);
                using var reader = cmd.ExecuteReader();
                if (!reader.Read()) return null;

                return new Dictionary<string, object?>
                {
                    ["UserId"] = reader.GetInt32(0),
                    ["Email"] = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    ["FullName"] = reader.IsDBNull(2) ? "" : reader.GetString(2)
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ GetUserById: {ex.Message}");
                throw;
            }
        }

        public static bool UserEmailExists(string? connectionString, string email, int? exceptUserId = null)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                EnsureUsersTable(connectionString);
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                using var cmd = conn.CreateCommand();
                cmd.CommandText = exceptUserId.HasValue
                    ? "SELECT COUNT(*) FROM [Users] WHERE LCase([Email]) = LCase(?) AND [UserId] <> ?"
                    : "SELECT COUNT(*) FROM [Users] WHERE LCase([Email]) = LCase(?)";
                cmd.Parameters.AddWithValue("@email", email.Trim());
                if (exceptUserId.HasValue)
                    cmd.Parameters.AddWithValue("@id", exceptUserId.Value);

                return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ UserEmailExists: {ex.Message}");
                throw;
            }
        }

        public static int InsertUser(string? connectionString, string email, string fullName, string password)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                EnsureUsersTable(connectionString);
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                using var cmd = conn.CreateCommand();
                cmd.CommandText = "INSERT INTO [Users] ([Email], [FullName], [Password]) VALUES (?, ?, ?)";
                cmd.Parameters.AddWithValue("@email", email.Trim());
                cmd.Parameters.AddWithValue("@fullName", fullName.Trim());
                cmd.Parameters.AddWithValue("@password", password.Trim());
                cmd.ExecuteNonQuery();

                using var idCmd = conn.CreateCommand();
                idCmd.CommandText = "SELECT @@IDENTITY";
                return Convert.ToInt32(idCmd.ExecuteScalar());
            }
            catch (Exception ex)
            {
                var detail = ex.InnerException?.Message ?? ex.Message;
                Console.WriteLine($"❌ InsertUser failed: {detail}");
                throw new InvalidOperationException($"Could not insert manager into Access: {detail}", ex);
            }
        }

        public static bool UpdateUser(string? connectionString, int userId, string fullName, string? password)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                EnsureUsersTable(connectionString);
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                using var cmd = conn.CreateCommand();
                if (string.IsNullOrWhiteSpace(password))
                {
                    cmd.CommandText = "UPDATE [Users] SET [FullName] = ? WHERE [UserId] = ?";
                    cmd.Parameters.AddWithValue("@fullName", fullName.Trim());
                    cmd.Parameters.AddWithValue("@id", userId);
                }
                else
                {
                    cmd.CommandText = "UPDATE [Users] SET [FullName] = ?, [Password] = ? WHERE [UserId] = ?";
                    cmd.Parameters.AddWithValue("@fullName", fullName.Trim());
                    cmd.Parameters.AddWithValue("@password", password.Trim());
                    cmd.Parameters.AddWithValue("@id", userId);
                }

                return cmd.ExecuteNonQuery() > 0;
            }
            catch (Exception ex)
            {
                var detail = ex.InnerException?.Message ?? ex.Message;
                Console.WriteLine($"❌ UpdateUser failed: {detail}");
                throw new InvalidOperationException($"Could not update manager in Access: {detail}", ex);
            }
        }

        public static bool DeleteUser(string? connectionString, int userId)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                EnsureUsersTable(connectionString);
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                using var cmd = conn.CreateCommand();
                cmd.CommandText = "DELETE FROM [Users] WHERE [UserId] = ?";
                cmd.Parameters.AddWithValue("@id", userId);
                return cmd.ExecuteNonQuery() > 0;
            }
            catch (Exception ex)
            {
                var detail = ex.InnerException?.Message ?? ex.Message;
                Console.WriteLine($"❌ DeleteUser failed: {detail}");
                throw new InvalidOperationException($"Could not delete manager from Access: {detail}", ex);
            }
        }

        public static void EnsureEmployeeAuthColumns(string? connectionString)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                using var conn = new OleDbConnection(oledb);
                conn.Open();
                if (!TableExists(conn, "Employees"))
                {
                    Console.WriteLine("⚠ Employees table not found");
                    return;
                }
                AddColumnIfMissing(conn, "Employees", "Email", "TEXT(255)");
                AddColumnIfMissing(conn, "Employees", "Password", "TEXT(255)");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ EnsureEmployeeAuthColumns: {ex.Message}");
            }
        }

        public static bool EmployeeEmailExists(string? connectionString, string email)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                using var conn = new OleDbConnection(oledb);
                conn.Open();
                if (!TableExists(conn, "Employees") || !ColumnExists(conn, "Employees", "Email"))
                    return false;

                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT COUNT(*) FROM [Employees] WHERE LCase([Email]) = LCase(?)";
                cmd.Parameters.AddWithValue("@email", email.Trim());
                var count = Convert.ToInt32(cmd.ExecuteScalar());
                return count > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ EmployeeEmailExists: {ex.Message}");
                return false;
            }
        }

        /// <summary>Insert worker into Employees — uses actual column names in your .accdb file.</summary>
        public static int? InsertEmployee(
            string? connectionString,
            string firstName,
            string email,
            string password,
            decimal hourlyWage = 0m,
            double productivityScore = 5.0)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            EnsureEmployeeAuthColumns(connectionString);
            var schema = EmployeeTableSchema.Load(connectionString);
            EmployeeColumnConfig.ProductivityColumnName = schema.ProductivityColumn;

            try
            {
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                if (!TableExists(conn, "Employees"))
                {
                    Console.WriteLine("❌ InsertEmployee: Employees table missing");
                    return null;
                }

                var prodCol = schema.ProductivityColumn;
                var cols = new List<string> { "FirstName", "HourlyWage", prodCol };
                var vals = new List<string> { "?", "?", "?" };
                var parameters = new List<object> { firstName, hourlyWage, productivityScore };

                if (schema.HasEmail)
                {
                    cols.Add("Email");
                    vals.Add("?");
                    parameters.Add(email);
                }
                if (schema.HasPassword)
                {
                    cols.Add("Password");
                    vals.Add("?");
                    parameters.Add(password);
                }
                if (schema.HasUserPassword)
                {
                    cols.Add("UserPassword");
                    vals.Add("?");
                    parameters.Add(password);
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText =
                    $"INSERT INTO [Employees] ([{string.Join("], [", cols)}]) VALUES ({string.Join(", ", vals)})";
                foreach (var p in parameters)
                    cmd.Parameters.AddWithValue("?", p);

                cmd.ExecuteNonQuery();

                using var idCmd = conn.CreateCommand();
                idCmd.CommandText = "SELECT @@IDENTITY";
                var id = Convert.ToInt32(idCmd.ExecuteScalar());

                DatabaseConnection.WriteActiveDatabaseMarker(oledb, id, email);
                Console.WriteLine($"✓ InsertEmployee id={id} → {DatabaseConnection.GetDataSource(oledb)}");
                return id;
            }
            catch (Exception ex)
            {
                var detail = ex.InnerException?.Message ?? ex.Message;
                Console.WriteLine($"❌ InsertEmployee failed: {detail}");
                throw new InvalidOperationException($"Could not insert employee into Access: {detail}", ex);
            }
        }

        public static object GetEmployeesDebugInfo(string? connectionString)
        {
            var path = DatabaseConnection.GetDataSource(
                ShiftBootstrap.NormalizeOleDbConnectionString(connectionString));
            var schema = EmployeeTableSchema.Load(connectionString);
            var employees = ListEmployees(connectionString);
            return new
            {
                databasePath = path,
                productivityColumn = schema.ProductivityColumn,
                employeeCount = employees.Count,
                employees
            };
        }

        /// <summary>Confirms the row exists with email, name, and password in the same .accdb file.</summary>
        public static Dictionary<string, object?>? GetEmployeeById(string? connectionString, int employeeId)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                using var conn = new OleDbConnection(oledb);
                conn.Open();

                var schema = EmployeeTableSchema.Load(connectionString);
                var prodCol = schema.ProductivityColumn;
                var selectCols = new List<string> { "EmployeeId", "FirstName", "HourlyWage", prodCol };
                if (schema.HasEmail) selectCols.Add("Email");
                if (schema.HasPassword) selectCols.Add("Password");

                using var cmd = conn.CreateCommand();
                cmd.CommandText =
                    $"SELECT [{string.Join("], [", selectCols)}] FROM [Employees] WHERE [EmployeeId] = ?";
                cmd.Parameters.AddWithValue("@id", employeeId);
                using var reader = cmd.ExecuteReader();
                if (!reader.Read()) return null;

                var row = new Dictionary<string, object?>
                {
                    ["EmployeeId"] = reader.GetInt32(0),
                    ["FirstName"] = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    ["HourlyWage"] = reader.IsDBNull(2) ? 0m : Convert.ToDecimal(reader.GetValue(2)),
                };
                row["ProductivityScore"] = reader.IsDBNull(3) ? 0.0 : Convert.ToDouble(reader.GetValue(3));
                var idx = 4;
                if (schema.HasEmail && reader.FieldCount > idx)
                {
                    row["Email"] = reader.IsDBNull(idx) ? null : reader.GetString(idx);
                    idx++;
                }
                if (schema.HasPassword && reader.FieldCount > idx)
                    row["Password"] = reader.IsDBNull(idx) ? null : reader.GetString(idx);
                return row;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ GetEmployeeById: {ex.Message}");
                return null;
            }
        }

        public static bool VerifyEmployeeSaved(
            string? connectionString,
            int employeeId,
            string firstName,
            string email,
            string password)
        {
            var row = GetEmployeeById(connectionString, employeeId);
            if (row == null) return false;

            var savedName = (row["FirstName"]?.ToString() ?? "").Trim();
            var savedEmail = (row["Email"]?.ToString() ?? "").Trim();
            var savedPassword = row.TryGetValue("Password", out var pw) ? pw?.ToString() ?? "" : "";

            return savedName.Equals(firstName.Trim(), StringComparison.OrdinalIgnoreCase)
                && savedEmail.Equals(email.Trim(), StringComparison.OrdinalIgnoreCase)
                && savedPassword == password;
        }

        public static (int EmployeeId, string FirstName, string Email)? FindEmployeeByEmailPassword(
            string? connectionString,
            string email,
            string password)
        {
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                using var conn = new OleDbConnection(oledb);
                conn.Open();
                if (!TableExists(conn, "Employees")) return null;

                using var cmd = conn.CreateCommand();
                if (ColumnExists(conn, "Employees", "Password"))
                {
                    cmd.CommandText = """
                        SELECT TOP 1 [EmployeeId], [FirstName], [Email]
                        FROM [Employees]
                        WHERE LCase([Email]) = LCase(?) AND [Password] = ?
                        ORDER BY [EmployeeId]
                        """;
                    cmd.Parameters.AddWithValue("@email", email.Trim());
                    cmd.Parameters.AddWithValue("@pw", password.Trim());
                }
                else
                {
                    cmd.CommandText = """
                        SELECT TOP 1 [EmployeeId], [FirstName], [Email]
                        FROM [Employees]
                        WHERE LCase([Email]) = LCase(?)
                        ORDER BY [EmployeeId]
                        """;
                    cmd.Parameters.AddWithValue("@email", email.Trim());
                }

                using var reader = cmd.ExecuteReader();
                if (!reader.Read()) return null;

                return (
                    reader.GetInt32(0),
                    reader.IsDBNull(1) ? "" : reader.GetString(1),
                    reader.IsDBNull(2) ? email : reader.GetString(2)
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ FindEmployeeByEmailPassword: {ex.Message}");
                return null;
            }
        }

        public static List<Dictionary<string, object?>> ListEmployees(string? connectionString)
        {
            var list = new List<Dictionary<string, object?>>();
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            try
            {
                using var conn = new OleDbConnection(oledb);
                conn.Open();
                if (!TableExists(conn, "Employees")) return list;

                var schema = EmployeeTableSchema.Load(connectionString);
                var prodCol = schema.ProductivityColumn;
                var selectCols = new List<string> { "EmployeeId", "FirstName", "HourlyWage", prodCol };
                if (schema.HasEmail) selectCols.Add("Email");

                using var cmd = conn.CreateCommand();
                cmd.CommandText =
                    $"SELECT [{string.Join("], [", selectCols)}] FROM [Employees] ORDER BY [EmployeeId]";

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    var row = new Dictionary<string, object?>
                    {
                        ["EmployeeId"] = reader.GetInt32(0),
                        ["FirstName"] = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        ["HourlyWage"] = reader.IsDBNull(2) ? 0m : Convert.ToDecimal(reader.GetValue(2)),
                        ["ProductivityScore"] = reader.IsDBNull(3) ? 0.0 : Convert.ToDouble(reader.GetValue(3)),
                    };
                    if (schema.HasEmail && reader.FieldCount > 4)
                        row["Email"] = reader.IsDBNull(4) ? null : reader.GetString(4);
                    list.Add(row);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ ListEmployees: {ex.Message}");
            }
            return list;
        }

        private static bool HasUsersSchema(OleDbConnection conn) =>
            ColumnExists(conn, "Users", "UserId") &&
            ColumnExists(conn, "Users", "Email") &&
            ColumnExists(conn, "Users", "FullName") &&
            ColumnExists(conn, "Users", "Password");

        private static void AddColumnIfMissing(OleDbConnection conn, string table, string column, string accessType)
        {
            if (ColumnExists(conn, table, column)) return;
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"ALTER TABLE [{table}] ADD COLUMN [{column}] {accessType}";
            cmd.ExecuteNonQuery();
            Console.WriteLine($"✓ Added {table}.{column}");
        }

        public static bool TableExistsPublic(OleDbConnection conn, string tableName) => TableExists(conn, tableName);
        public static bool ColumnExistsPublic(OleDbConnection conn, string tableName, string columnName) =>
            ColumnExists(conn, tableName, columnName);

        private static bool TableExists(OleDbConnection conn, string tableName)
        {
            var schema = conn.GetSchema("Tables", new[] { null, null, tableName, "TABLE" });
            return schema.Rows.Count > 0;
        }

        private static bool ColumnExists(OleDbConnection conn, string tableName, string columnName)
        {
            var schema = conn.GetSchema("Columns", new[] { null, null, tableName, columnName });
            return schema.Rows.Count > 0;
        }
    }
}

using System.Data.OleDb;

namespace Backend.Services
{
    /// <summary>Reads actual Employees column names from the open .accdb (handles Productivity vs ProductivityScore).</summary>
    public sealed class EmployeeTableSchema
    {
        public string ProductivityColumn { get; private set; } = "ProductivityScore";
        public bool HasEmail { get; private set; }
        public bool HasPassword { get; private set; }
        public bool HasUserPassword { get; private set; }

        public static EmployeeTableSchema Load(string? connectionString)
        {
            var schema = new EmployeeTableSchema();
            var oledb = ShiftBootstrap.NormalizeOleDbConnectionString(connectionString);
            using var conn = new OleDbConnection(oledb);
            conn.Open();

            if (AccessSchemaHelper.TableExistsPublic(conn, "Employees"))
            {
                schema.HasEmail = AccessSchemaHelper.ColumnExistsPublic(conn, "Employees", "Email");
                schema.HasPassword = AccessSchemaHelper.ColumnExistsPublic(conn, "Employees", "Password");
                schema.HasUserPassword = AccessSchemaHelper.ColumnExistsPublic(conn, "Employees", "UserPassword");
                if (AccessSchemaHelper.ColumnExistsPublic(conn, "Employees", "ProductivityScore"))
                    schema.ProductivityColumn = "ProductivityScore";
                else if (AccessSchemaHelper.ColumnExistsPublic(conn, "Employees", "Productivity"))
                    schema.ProductivityColumn = "Productivity";
            }

            return schema;
        }
    }
}

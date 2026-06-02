namespace Backend.Services
{
    /// <summary>Default Access database file used when appsettings has no connection string.</summary>
    public static class DatabasePaths
    {
        public const string DefaultAccessDbPath = @"C:\Project\Shiftly\Backend\DB\ShiftlyDB.accdb";

        public static string DefaultConnectionString =>
            $"Data Source={DefaultAccessDbPath}";
    }
}

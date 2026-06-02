namespace Backend.Services
{
    /// <summary>Set at startup from the real Access Employees table columns.</summary>
    public static class EmployeeColumnConfig
    {
        public static string ProductivityColumnName { get; set; } = "ProductivityScore";
    }
}

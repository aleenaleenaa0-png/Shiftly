// =============================================================================
// AppData.cs — ربط التطبيق بقاعدة Access
// =============================================================================
// هذا الملف يخبر ASP.NET كيف تتوافق جداول C# مع جداول Access.
// للمختبر: أي تغيير في أسماء الأعمدة في Access قد يحتاج تعديل هنا.
// =============================================================================

using Backend.Services;
using Microsoft.EntityFrameworkCore;

namespace Backend.Models
{
    /// <summary>السياق الرئيسي لقاعدة البيانات — كل الـ Controllers تستخدمه للقراءة والكتابة.</summary>
    public class AppData : DbContext
    {
        public AppData(DbContextOptions<AppData> options) : base(options)
        {
        }

        // الجداول الأربعة الأساسية في ShiftlyDB.accdb
        public DbSet<User> Users => Set<User>();           // مديرون
        public DbSet<Employee> Employees => Set<Employee>(); // عمال
        public DbSet<Shift> Shifts => Set<Shift>();         // مناوبات الأسبوع
        public DbSet<Availability> Availabilities => Set<Availability>(); // توفر العمال

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(e => e.UserId);
                entity.Property(e => e.UserId).ValueGeneratedOnAdd();
                entity.Property(e => e.Email).IsRequired().HasMaxLength(200);
                entity.Property(e => e.FullName).IsRequired().HasMaxLength(100);
                entity.Property(e => e.Password).IsRequired().HasMaxLength(200);
            });

            modelBuilder.Entity<Shift>(entity =>
            {
                entity.HasKey(e => e.ShiftId);
                entity.Property(e => e.ShiftId)
                    .HasColumnName("Shift_ID")
                    .ValueGeneratedOnAdd();
                entity.Property(e => e.StartTime).HasColumnName("Shift_StartTime");
                entity.Property(e => e.EndTime).HasColumnName("Shift_EndTime");
                entity.Property(e => e.RequiredProductivity)
                    .HasColumnName("Shift_ReqThroughput")
                    .HasColumnType("decimal(18,2)");
                entity.Property(e => e.EmployeeId).HasColumnName("Shift_EmployeeID");
                entity.Property(e => e.SlotNumber).HasColumnName("Shift_SlotNumber");
                entity.Ignore(e => e.MatchScore);
            });

            modelBuilder.Entity<Employee>(entity =>
            {
                entity.Property(e => e.HourlyWage).HasColumnType("decimal(18,2)");
                entity.Property(e => e.Password).HasColumnName("Password").HasMaxLength(200);
                entity.Property(e => e.ProductivityScore)
                    .HasColumnName(EmployeeColumnConfig.ProductivityColumnName);
            });

            modelBuilder.Entity<Employee>()
                .HasMany(e => e.Availabilities)
                .WithOne(a => a.Employee!)
                .HasForeignKey(a => a.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Employee>()
                .HasMany(e => e.Shifts)
                .WithOne(sh => sh.Employee!)
                .HasForeignKey(sh => sh.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Availability>(entity =>
            {
                entity.HasKey(a => a.AvailabilityId);
                entity.Property(a => a.AvailabilityId)
                    .HasColumnName("AvailabilityID")
                    .ValueGeneratedOnAdd();
                entity.Property(a => a.EmployeeId).HasColumnName("EmployeeId");
                entity.Property(a => a.ShiftId).HasColumnName("ShiftId");
                entity.Property(a => a.IsAvailable).HasColumnName("IsAvailable");

                entity.HasOne(a => a.Employee)
                    .WithMany(e => e.Availabilities)
                    .HasForeignKey(a => a.EmployeeId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(a => a.Shift)
                    .WithMany(s => s.Availabilities)
                    .HasForeignKey(a => a.ShiftId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(a => new { a.EmployeeId, a.ShiftId }).IsUnique();
            });
        }
    }
}

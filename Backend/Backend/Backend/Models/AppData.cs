using Microsoft.EntityFrameworkCore;

namespace Backend.Models
{
    public class AppData : DbContext
    {
        public AppData(DbContextOptions<AppData> options) : base(options)
        {
        }

        public DbSet<Store> Stores => Set<Store>();
        public DbSet<User> Users => Set<User>();
        public DbSet<Employee> Employees => Set<Employee>();
        public DbSet<Shift> Shifts => Set<Shift>();
        public DbSet<Availability> Availabilities => Set<Availability>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure Store entity
            modelBuilder.Entity<Store>(entity =>
            {
                entity.HasKey(e => e.StoreId);
                entity.Property(e => e.StoreId)
                    .ValueGeneratedOnAdd(); // Auto-increment
                entity.Property(e => e.Name)
                    .IsRequired()
                    .HasMaxLength(100);
                entity.Property(e => e.Location)
                    .HasMaxLength(200);
                entity.Property(e => e.HourlySalesTarget)
                    .HasColumnType("decimal(18,2)");
                entity.Property(e => e.HourlyLaborBudget)
                    .HasColumnType("decimal(18,2)");
            });

            // Configure User entity
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(e => e.UserId);
                entity.Property(e => e.UserId)
                    .ValueGeneratedOnAdd(); // Auto-increment
                entity.Property(e => e.Email)
                    .IsRequired()
                    .HasMaxLength(200);
                entity.Property(e => e.FullName)
                    .IsRequired()
                    .HasMaxLength(100);
                entity.Property(e => e.Password)
                    .IsRequired()
                    .HasMaxLength(200);
                entity.Property(e => e.StoreId)
                    .IsRequired();
            });

            modelBuilder.Entity<Store>()
                .HasMany(s => s.Employees)
                .WithOne(e => e.Store!)
                .HasForeignKey(e => e.StoreId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Store>()
                .HasMany(s => s.Users)
                .WithOne(u => u.Store!)
                .HasForeignKey(u => u.StoreId)
                .OnDelete(DeleteBehavior.Restrict);

            // Configure Shift entity with correct Access column names
            // Access table: Shift_ID, Shift_StoreID, Shift_StartTime, Shift_EndTime, Shift_EmployeeID, Shift_ReqThroughput, Shift_SlotNumber
            modelBuilder.Entity<Shift>(entity =>
            {
                entity.HasKey(e => e.ShiftId);
                entity.Property(e => e.ShiftId)
                    .HasColumnName("Shift_ID")
                    .ValueGeneratedOnAdd();
                entity.Property(e => e.StoreId)
                    .HasColumnName("Shift_StoreID");
                entity.Property(e => e.StartTime)
                    .HasColumnName("Shift_StartTime");
                entity.Property(e => e.EndTime)
                    .HasColumnName("Shift_EndTime");
                entity.Property(e => e.RequiredProductivity)
                    .HasColumnName("Shift_ReqThroughput")
                    .HasColumnType("decimal(18,2)");
                entity.Property(e => e.EmployeeId)
                    .HasColumnName("Shift_EmployeeID");
                entity.Property(e => e.SlotNumber)
                    .HasColumnName("Shift_SlotNumber");
                // MatchScore is [NotMapped] - does not exist in Access database
                entity.Ignore(e => e.MatchScore);
            });
            
            // Configure Employee entity with decimal column types
            modelBuilder.Entity<Employee>(entity =>
            {
                entity.Property(e => e.HourlyWage)
                    .HasColumnType("decimal(18,2)");
            });

            modelBuilder.Entity<Store>()
                .HasMany(s => s.Shifts)
                .WithOne(sh => sh.Store!)
                .HasForeignKey(sh => sh.StoreId)
                .OnDelete(DeleteBehavior.Cascade);

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

            // Configure Availability entity relationships
            // Access table columns: AvailabilityID, EmployeeId, ShiftId, IsAvailable
            modelBuilder.Entity<Availability>(entity =>
            {
                entity.HasKey(a => a.AvailabilityId);
                entity.Property(a => a.AvailabilityId)
                    .HasColumnName("AvailabilityID")
                    .ValueGeneratedOnAdd();
                
                // Column names match Access schema exactly
                entity.Property(a => a.EmployeeId)
                    .HasColumnName("EmployeeId");
                entity.Property(a => a.ShiftId)
                    .HasColumnName("ShiftId");
                entity.Property(a => a.IsAvailable)
                    .HasColumnName("IsAvailable");
                
                // Relationship with Employee
                entity.HasOne(a => a.Employee)
                    .WithMany(e => e.Availabilities)
                    .HasForeignKey(a => a.EmployeeId)
                    .OnDelete(DeleteBehavior.Cascade);
                
                // Relationship with Shift - ShiftId references Shift.ShiftId which maps to Shift_ID
                entity.HasOne(a => a.Shift)
                    .WithMany(s => s.Availabilities)
                    .HasForeignKey(a => a.ShiftId)
                    .OnDelete(DeleteBehavior.Cascade);
                
                // Ensure unique combination of EmployeeId + ShiftId
                entity.HasIndex(a => new { a.EmployeeId, a.ShiftId })
                    .IsUnique();
            });
        }
    }
}



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
        }
    }
}



using Backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Data.OleDb;

namespace Backend.Services
{
    /// <summary>
    /// Clears shifts/availabilities and seeds exactly 14 weekly slots (IDs restart from 1 when possible).
    /// </summary>
    public static class ShiftBootstrap
    {
        public static DateTime GetWeekStart(DateTime? weekStart = null)
        {
            if (weekStart.HasValue)
                return weekStart.Value.Date;

            var today = DateTime.Today;
            var dayOfWeek = (int)today.DayOfWeek;
            return today.AddDays(dayOfWeek == 0 ? -6 : dayOfWeek - 1).Date;
        }

        public static async Task ResetAndSeedCurrentWeekAsync(AppData db, string connectionString, bool forceReset = true)
        {
            var weekStart = GetWeekStart();
            var weekEnd = weekStart.AddDays(7);

            if (forceReset)
            {
                try
                {
                    await db.Database.ExecuteSqlRawAsync("DELETE FROM Availabilities");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"⚠ Availabilities delete: {ex.Message}");
                }

                try
                {
                    await db.Database.ExecuteSqlRawAsync("DELETE FROM Shifts");
                    Console.WriteLine("✓ Deleted all shifts");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"⚠ Shifts delete: {ex.Message}");
                }

                TryResetShiftIdentity(connectionString);
            }

            var existing = await db.Shifts
                .Where(s => s.StartTime >= weekStart && s.StartTime < weekEnd)
                .CountAsync();

            if (existing == 14 && !forceReset)
            {
                Console.WriteLine("✓ Week already has 14 shifts");
                return;
            }

            if (existing != 14)
            {
                var toRemove = await db.Shifts
                    .Where(s => s.StartTime >= weekStart && s.StartTime < weekEnd)
                    .ToListAsync();
                if (toRemove.Count > 0)
                {
                    db.Shifts.RemoveRange(toRemove);
                    await db.SaveChangesAsync();
                }
            }

            var shifts = new List<Shift>();
            int slotNumber = 1;
            for (int day = 0; day < 7; day++)
            {
                var currentDay = weekStart.AddDays(day);
                shifts.Add(new Shift
                {
                    StartTime = currentDay.AddHours(9),
                    EndTime = currentDay.AddHours(15),
                    RequiredProductivity = 2500,
                    SlotNumber = slotNumber++
                });
                shifts.Add(new Shift
                {
                    StartTime = currentDay.AddHours(15),
                    EndTime = currentDay.AddHours(21),
                    RequiredProductivity = 3500,
                    SlotNumber = slotNumber++
                });
            }

            db.Shifts.AddRange(shifts);
            await db.SaveChangesAsync();
            Console.WriteLine($"✓ Seeded {shifts.Count} shifts for week {weekStart:yyyy-MM-dd} (Shift_ID 1..{shifts.Count} when DB was empty)");
        }

        private static void TryResetShiftIdentity(string connectionString)
        {
            try
            {
                var builder = new OleDbConnectionStringBuilder(connectionString);
                using var conn = new OleDbConnection(builder.ConnectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "ALTER TABLE Shifts ALTER COLUMN Shift_ID COUNTER(1,1)";
                cmd.ExecuteNonQuery();
                Console.WriteLine("✓ Reset Shifts Shift_ID counter to start at 1");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ Could not reset Shift_ID counter (new rows still work): {ex.Message}");
            }
        }
    }
}

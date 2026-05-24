// =============================================================================
// ShiftBootstrap.cs — إنشاء 14 مناوبة لكل أسبوع
// =============================================================================
// عند تشغيل السيرفر: يُفرَّغ جدول المناوبات (والتوفر) ويُنشأ 14 صفاً جديداً.
// Slot 1 = الإثنين 09:00–15:00، Slot 2 = الإثنين 15:00–21:00، … حتى Slot 14.
// للمختبر: بعد إعادة تشغيل Backend قد تُمسح التوفرات القديمة — أعد اختبار التوفر.
// =============================================================================

using Backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Data.OleDb;

namespace Backend.Services
{
    public static class ShiftBootstrap
    {
        /// <summary>أول يوم في الأسبوع (الإثنين) — يُستخدم في كل استعلامات الأسبوع.</summary>
        public static DateTime GetWeekStart(DateTime? weekStart = null)
        {
            if (weekStart.HasValue)
            {
                var value = weekStart.Value;
                // Use calendar date parts so UTC midnight in query strings does not shift the week.
                return new DateTime(value.Year, value.Month, value.Day);
            }

            var today = DateTime.Today;
            var dayOfWeek = (int)today.DayOfWeek;
            return today.AddDays(dayOfWeek == 0 ? -6 : dayOfWeek - 1).Date;
        }

        /// <summary>
        /// يمسح المناوبات/التوفر (إن forceReset) ويُدخل 14 مناوبة للأسبوع الحالي.
        /// </summary>
        public static async Task ResetAndSeedCurrentWeekAsync(AppData db, string connectionString, bool forceReset = true)
        {
            var weekStart = GetWeekStart();
            var weekEnd = weekStart.AddDays(7);

            if (forceReset)
            {
                // تحذير للمختبر: هذا يحذف كل سجلات التوفر عند كل تشغيل كامل للسيرفر
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

        public static string NormalizeOleDbConnectionString(string connectionString)
        {
            var raw = connectionString?.Trim()
                ?? "Data Source=C:\\Users\\aleen\\Documents\\ShiftlyDB.accdb";
            if (raw.Contains("Provider=", StringComparison.OrdinalIgnoreCase))
                return raw;
            var dataSource = raw.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase)
                ? raw
                : "Data Source=" + raw;
            return "Provider=Microsoft.ACE.OLEDB.12.0;" + dataSource + ";";
        }

        /// <summary>יוצר 14 משמרות לשבוע (OleDb בלבד — נמנע משגיאת #Dual ב-Access).</summary>
        public static void EnsureFourteenShiftsOleDb(OleDbConnection conn, DateTime weekStart)
        {
            var weekStartDate = GetWeekStart(weekStart);
            var weekEnd = weekStartDate.AddDays(7);
            for (int day = 0; day < 7; day++)
            {
                var date = weekStartDate.AddDays(day).Date;
                for (int part = 0; part < 2; part++)
                {
                    int slotNum = day * 2 + part + 1;
                    var start = date.AddHours(part == 0 ? 9 : 15);
                    var end = date.AddHours(part == 0 ? 15 : 21);
                    object? existing = null;
                    using (var check = conn.CreateCommand())
                    {
                        check.CommandText = @"SELECT TOP 1 Shift_ID FROM Shifts 
WHERE Shift_SlotNumber = ? AND Shift_StartTime >= ? AND Shift_StartTime < ?";
                        check.Parameters.Add(new OleDbParameter("@p1", slotNum));
                        check.Parameters.Add(new OleDbParameter("@p2", weekStartDate));
                        check.Parameters.Add(new OleDbParameter("@p3", weekEnd));
                        existing = check.ExecuteScalar();
                    }
                    if (existing != null && existing != DBNull.Value)
                        continue;
                    using var ins = conn.CreateCommand();
                    ins.CommandText = @"INSERT INTO Shifts (Shift_StartTime, Shift_EndTime, Shift_ReqThroughput, Shift_SlotNumber) VALUES (?, ?, ?, ?)";
                    ins.Parameters.Add(new OleDbParameter("@p1", start));
                    ins.Parameters.Add(new OleDbParameter("@p2", end));
                    ins.Parameters.Add(new OleDbParameter("@p3", (decimal)(part == 0 ? 2500 : 3500)));
                    ins.Parameters.Add(new OleDbParameter("@p4", slotNum));
                    ins.ExecuteNonQuery();
                }
            }
        }

        /// <summary>יוצר 14 משמרות לשבוע הנתון (אם חסר) — ללא EF, בטוח ל-Access.</summary>
        public static async Task EnsureFourteenShiftsForWeekAsync(string connectionString, DateTime weekStart)
        {
            var weekStartDate = GetWeekStart(weekStart);
            var connStr = NormalizeOleDbConnectionString(connectionString);
            using var conn = new OleDbConnection(connStr);
            await conn.OpenAsync();
            EnsureFourteenShiftsOleDb(conn, weekStartDate);
            Console.WriteLine($"✓ Ensured 14 shifts for week {weekStartDate:yyyy-MM-dd} (OleDb)");
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

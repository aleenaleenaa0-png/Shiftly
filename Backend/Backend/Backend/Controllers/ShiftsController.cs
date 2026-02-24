using Backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace Backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ShiftsController : ControllerBase
    {
        private readonly AppData _db;

        public ShiftsController(AppData db)
        {
            _db = db;
        }

        // GET: api/Shifts
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetShifts([FromQuery] int? storeId = null, [FromQuery] DateTime? weekStart = null)
        {
            try
            {
                // Ensure Shifts table exists
                try
                {
                    var testCount = await _db.Shifts.CountAsync();
                }
                catch (Exception tableEx)
                {
                    if (tableEx.Message.Contains("cannot find") || tableEx.Message.Contains("does not exist"))
                    {
                        try
                        {
                            await _db.Database.ExecuteSqlRawAsync(@"
                                CREATE TABLE Shifts (
                                    Shift_ID AUTOINCREMENT PRIMARY KEY,
                                    Shift_StoreID INTEGER NOT NULL,
                                    Shift_StartTime DATETIME NOT NULL,
                                    Shift_EndTime DATETIME NOT NULL,
                                    Shift_ReqThroughput DECIMAL(18,2) NOT NULL,
                                    Shift_EmployeeID INTEGER,
                                    Shift_SlotNumber INTEGER
                                )
                            ");
                            Console.WriteLine("✓ Created Shifts table");
                        }
                        catch (Exception createEx)
                        {
                            return StatusCode(500, new 
                            { 
                                error = "Database setup error", 
                                message = $"Could not create Shifts table: {createEx.Message}" 
                            });
                        }
                    }
                }

                var query = _db.Shifts
                    .Include(s => s.Store)
                    .AsQueryable();

                // Filter by store if provided
                if (storeId.HasValue)
                {
                    query = query.Where(s => s.StoreId == storeId.Value);
                }

                // Filter by week if provided
                DateTime? actualWeekStart = weekStart;
                if (weekStart.HasValue)
                {
                    var weekEnd = weekStart.Value.AddDays(7);
                    query = query.Where(s => s.StartTime >= weekStart.Value && s.StartTime < weekEnd);
                }
                else
                {
                    // If no weekStart provided, use current week
                    var today = DateTime.Today;
                    var dayOfWeek = (int)today.DayOfWeek;
                    var monday = today.AddDays(-(dayOfWeek == 0 ? 6 : dayOfWeek - 1));
                    actualWeekStart = monday;
                    var weekEnd = monday.AddDays(7);
                    query = query.Where(s => s.StartTime >= monday && s.StartTime < weekEnd);
                }

                // CRITICAL: ALWAYS ensure EXACTLY 14 shifts exist for this week
                // DELETE ALL existing shifts and recreate exactly 14 to ensure clean state
                if (storeId.HasValue && actualWeekStart.HasValue)
                {
                    var weekEnd = actualWeekStart.Value.AddDays(7);
                    var weekStartDate = actualWeekStart.Value.Date;
                    
                    // Get all existing shifts for this week
                    var existingShifts = await _db.Shifts
                        .Where(s => s.StoreId == storeId.Value && 
                                   s.StartTime >= weekStartDate && 
                                   s.StartTime < weekEnd)
                        .ToListAsync();
                    
                    Console.WriteLine($"📊 Found {existingShifts.Count} existing shifts for store {storeId} and week starting {weekStartDate:yyyy-MM-dd}");
                    
                    // CRITICAL: If we don't have exactly 14 shifts, DELETE ALL (by SQL) and recreate exactly 14
                    if (existingShifts.Count != 14)
                    {
                        Console.WriteLine($"⚠ Found {existingShifts.Count} shifts (should be exactly 14). Deleting ALL and recreating exactly 14...");
                        
                        // Delete ALL shifts for this store+week by raw SQL so we don't miss any (avoids only deleting loaded entities)
                        var deleted = await _db.Database.ExecuteSqlRawAsync(
                            "DELETE FROM Shifts WHERE Shift_StoreID = {0} AND Shift_StartTime >= {1} AND Shift_StartTime < {2}",
                            storeId.Value, weekStartDate, weekEnd);
                        if (deleted > 0)
                            Console.WriteLine($"✓ Deleted {deleted} shifts via SQL");
                        
                    // Create EXACTLY 14 shifts (Monday-Sunday, Morning and Afternoon)
                    // SlotNumber: 1-14 (Monday Morning=1, Monday Afternoon=2, ..., Sunday Afternoon=14)
                    var shiftsToCreate = new List<Shift>();
                    int slotNumber = 1;
                    for (int day = 0; day < 7; day++)
                    {
                        var currentDay = weekStartDate.AddDays(day);
                        
                        // Morning shift: 9:00 - 15:00
                        shiftsToCreate.Add(new Shift
                        {
                            StoreId = storeId.Value,
                            StartTime = currentDay.AddHours(9),
                            EndTime = currentDay.AddHours(15),
                            RequiredProductivity = 2500,
                            SlotNumber = slotNumber++ // Monday Morning = 1, Tuesday Morning = 3, etc.
                        });
                        
                        // Afternoon shift: 15:00 - 21:00
                        shiftsToCreate.Add(new Shift
                        {
                            StoreId = storeId.Value,
                            StartTime = currentDay.AddHours(15),
                            EndTime = currentDay.AddHours(21),
                            RequiredProductivity = 3500,
                            SlotNumber = slotNumber++ // Monday Afternoon = 2, Tuesday Afternoon = 4, etc.
                        });
                    }
                        
                        // Verify we're creating exactly 14
                        if (shiftsToCreate.Count != 14)
                        {
                            Console.WriteLine($"❌ ERROR: Expected 14 shifts to create, but got {shiftsToCreate.Count}");
                        }
                        else
                        {
                            _db.Shifts.AddRange(shiftsToCreate);
                            await _db.SaveChangesAsync();
                            Console.WriteLine($"✓ Created exactly {shiftsToCreate.Count} shifts for week starting {weekStartDate:yyyy-MM-dd}");
                            
                            // Reload to get the actual Shift_IDs from Access
                            var createdShifts = await _db.Shifts
                                .Where(s => s.StoreId == storeId.Value && 
                                           s.StartTime >= weekStartDate && 
                                           s.StartTime < weekEnd)
                                .OrderBy(s => s.StartTime)
                                .ToListAsync();
                            
                            Console.WriteLine($"✓ Verified: {createdShifts.Count} shifts created with Shift_IDs:");
                            foreach (var shift in createdShifts)
                            {
                                var dayName = shift.StartTime.DayOfWeek.ToString();
                                var shiftType = shift.StartTime.Hour == 9 ? "Morning" : "Afternoon";
                                Console.WriteLine($"  Shift_ID: {shift.ShiftId}, {dayName} {shiftType} ({shift.StartTime:yyyy-MM-dd HH:mm} - {shift.EndTime:HH:mm})");
                            }
                        }
                    }
                    else
                    {
                        Console.WriteLine($"✓ Already have exactly 14 shifts for this week");
                    }
                    
                    // CRITICAL: Ensure every shift has SlotNumber 1-14 by StartTime order (fixes NULL/wrong values)
                    var weekShiftsOrdered = await _db.Shifts
                        .Where(s => s.StoreId == storeId.Value && s.StartTime >= weekStartDate && s.StartTime < weekEnd)
                        .OrderBy(s => s.StartTime)
                        .ToListAsync();
                    if (weekShiftsOrdered.Count == 14)
                    {
                        bool needSave = false;
                        for (int i = 0; i < 14; i++)
                        {
                            var s = weekShiftsOrdered[i];
                            int wantSlot = i + 1;
                            if (s.SlotNumber != wantSlot)
                            {
                                s.SlotNumber = wantSlot;
                                needSave = true;
                            }
                        }
                        if (needSave)
                        {
                            await _db.SaveChangesAsync();
                            Console.WriteLine($"✓ Set SlotNumber 1-14 on all 14 shifts (by StartTime order)");
                        }
                    }
                    
                    // Re-query to get all shifts for this week (should be exactly 14)
                    query = _db.Shifts
                        .Include(s => s.Store)
                        .Where(s => s.StoreId == storeId.Value);
                    query = query.Where(s => s.StartTime >= weekStartDate && s.StartTime < weekEnd);
                    
                    var finalCount = await query.CountAsync();
                    Console.WriteLine($"✓ Final shift count for this week: {finalCount} (must be 14)");
                    
                    if (finalCount != 14)
                    {
                        Console.WriteLine($"❌ CRITICAL ERROR: Shift count is {finalCount}, not 14! This will cause availability issues.");
                        if (finalCount < 14)
                        {
                            // Create missing slots so we have exactly 14 (e.g. only 12 exist = missing Sunday slots 13,14)
                            var existingSlotNumbers = await _db.Shifts
                                .Where(s => s.StoreId == storeId.Value && s.StartTime >= weekStartDate && s.StartTime < weekEnd && s.SlotNumber >= 1 && s.SlotNumber <= 14)
                                .Select(s => s.SlotNumber!.Value)
                                .Distinct()
                                .ToListAsync();
                            var missingSlots = Enumerable.Range(1, 14).Except(existingSlotNumbers).ToList();
                            if (missingSlots.Count > 0)
                            {
                                Console.WriteLine($"  Creating {missingSlots.Count} missing slot(s): [{string.Join(", ", missingSlots)}]");
                                foreach (var slot in missingSlots)
                                {
                                    int day = (slot - 1) / 2;
                                    int part = (slot - 1) % 2;
                                    var date = weekStartDate.AddDays(day).Date;
                                    var start = date.AddHours(part == 0 ? 9 : 15);
                                    var end = date.AddHours(part == 0 ? 15 : 21);
                                    _db.Shifts.Add(new Shift
                                    {
                                        StoreId = storeId.Value,
                                        SlotNumber = slot,
                                        StartTime = start,
                                        EndTime = end,
                                        RequiredProductivity = part == 0 ? 2500 : 3500
                                    });
                                }
                                await _db.SaveChangesAsync();
                                Console.WriteLine($"✓ Created {missingSlots.Count} missing shift(s)");
                                query = _db.Shifts.Include(s => s.Store).Where(s => s.StoreId == storeId.Value);
                                query = query.Where(s => s.StartTime >= weekStartDate && s.StartTime < weekEnd);
                            }
                        }
                    }
                }

                // Ensure any remaining shifts have valid SlotNumber (fallback: by StartTime order)
                if (storeId.HasValue && actualWeekStart.HasValue)
                {
                    var weekStartDate = actualWeekStart.Value.Date;
                    var weekEnd = weekStartDate.AddDays(7);
                    
                    // Load shifts with invalid SlotNumber and fix by StartTime order (no Access WEEKDAY dependency)
                    var shiftsToUpdate = await query
                        .Where(s => s.SlotNumber == null || s.SlotNumber < 1 || s.SlotNumber > 14)
                        .OrderBy(s => s.StartTime)
                        .ToListAsync();
                    
                    if (shiftsToUpdate.Count > 0)
                    {
                        Console.WriteLine($"⚠ Found {shiftsToUpdate.Count} shifts with invalid SlotNumber. Fixing by StartTime order...");
                        var allWeekShifts = await _db.Shifts
                            .Where(s => s.StoreId == storeId.Value && s.StartTime >= weekStartDate && s.StartTime < weekEnd)
                            .OrderBy(s => s.StartTime)
                            .ToListAsync();
                        for (int i = 0; i < allWeekShifts.Count && i < 14; i++)
                        {
                            allWeekShifts[i].SlotNumber = i + 1;
                        }
                        await _db.SaveChangesAsync();
                        Console.WriteLine($"✓ Set SlotNumber 1-{Math.Min(14, allWeekShifts.Count)} on shifts for this week");
                        query = _db.Shifts.Include(s => s.Store).Where(s => s.StoreId == storeId.Value);
                        query = query.Where(s => s.StartTime >= weekStartDate && s.StartTime < weekEnd);
                    }
                }
                
                // CRITICAL: Delete any shifts beyond 14 for this week
                // We should have exactly 14 shifts (one per SlotNumber 1-14)
                // Use projection to avoid DBNull casting errors
                var allShiftsForWeek = await query
                    .Select(s => new { s.ShiftId, SlotNumber = s.SlotNumber ?? 0 })
                    .ToListAsync();
                    
                if (allShiftsForWeek.Count > 14)
                {
                    Console.WriteLine($"⚠ Found {allShiftsForWeek.Count} shifts for this week (should be exactly 14). Deleting extras...");
                    
                    // Group by SlotNumber; delete only duplicates (keep one per slot)
                    var duplicateShiftIds = allShiftsForWeek
                        .Where(s => s.SlotNumber >= 1 && s.SlotNumber <= 14)
                        .GroupBy(s => s.SlotNumber)
                        .Where(g => g.Count() > 1)
                        .SelectMany(g => g.OrderByDescending(s => s.ShiftId).Skip(1))
                        .Select(s => s.ShiftId)
                        .ToList();
                    var invalidShiftIds = allShiftsForWeek
                        .Where(s => s.SlotNumber < 1 || s.SlotNumber > 14)
                        .Select(s => s.ShiftId)
                        .ToList();
                    var shiftIdsToDelete = duplicateShiftIds.Concat(invalidShiftIds).Distinct().ToList();
                    
                    if (shiftIdsToDelete.Count > 0)
                    {
                        var shiftsToDelete = await _db.Shifts
                            .Where(s => shiftIdsToDelete.Contains(s.ShiftId))
                            .ToListAsync();
                            
                        _db.Shifts.RemoveRange(shiftsToDelete);
                        await _db.SaveChangesAsync();
                        Console.WriteLine($"✓ Deleted {shiftsToDelete.Count} extra/invalid shift(s)");
                    }
                }
                
                // Select only the fields we need, including SlotNumber for organization
                // Filter out shifts with invalid SlotNumber (shouldn't happen after update above)
                // Use nullable comparison to handle any remaining NULL values
                var shifts = await query
                    .Where(s => s.SlotNumber != null && s.SlotNumber >= 1 && s.SlotNumber <= 14) // Only valid SlotNumbers (handle NULL)
                    .Select(s => new
                    {
                        s.ShiftId,
                        SlotNumber = s.SlotNumber ?? 0, // Convert nullable to int (shouldn't be null after update, but safe)
                        s.StoreId,
                        StoreName = s.Store != null ? s.Store.Name : null,
                        s.StartTime,
                        s.EndTime,
                        s.RequiredProductivity,
                        s.EmployeeId,
                        // Get EmployeeName from a subquery to avoid loading all Employee properties
                        EmployeeName = s.EmployeeId != null 
                            ? _db.Employees
                                .Where(e => e.EmployeeId == s.EmployeeId)
                                .OrderBy(e => e.EmployeeId)
                                .Select(e => e.FirstName)
                                .FirstOrDefault()
                            : null
                        // MatchScore removed - does not exist in Access database
                    })
                    .Where(s => s.SlotNumber >= 1 && s.SlotNumber <= 14) // Final filter to ensure valid SlotNumbers
                    .OrderBy(s => s.SlotNumber) // Sort by SlotNumber (1-14) for organization
                    .ToListAsync();
                
                // CRITICAL: Verify we have exactly 14 shifts with SlotNumbers 1-14
                if (shifts.Count != 14)
                {
                    Console.WriteLine($"❌ ERROR: Expected 14 shifts, but got {shifts.Count}!");
                }
                else
                {
                    var slotNumbers = shifts.Select(s => s.SlotNumber).OrderBy(s => s).ToList();
                    var hasAllSlots = slotNumbers.SequenceEqual(Enumerable.Range(1, 14));
                    if (!hasAllSlots)
                    {
                        Console.WriteLine($"❌ ERROR: Missing slots! Expected 1-14, got: [{string.Join(", ", slotNumbers)}]");
                    }
                    else
                    {
                        Console.WriteLine($"✓ Successfully retrieved exactly 14 shifts with SlotNumbers 1-14");
                    }
                }

                return Ok(shifts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve shifts", message = ex.Message });
            }
        }

        // GET: api/Shifts/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetShift(int id)
        {
            try
            {
                var shift = await _db.Shifts
                    .Include(s => s.Store)
                    .FirstOrDefaultAsync(s => s.ShiftId == id);

                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                // Get employee name separately to avoid loading all Employee properties
                string? employeeName = null;
                if (shift.EmployeeId.HasValue)
                {
                    var employee = await _db.Employees
                        .Where(e => e.EmployeeId == shift.EmployeeId.Value)
                        .OrderBy(e => e.EmployeeId)
                        .Select(e => e.FirstName)
                        .FirstOrDefaultAsync();
                    employeeName = employee;
                }

                return Ok(new
                {
                    shift.ShiftId,
                    shift.StoreId,
                    StoreName = shift.Store?.Name,
                    shift.StartTime,
                    shift.EndTime,
                    shift.RequiredProductivity,
                    shift.EmployeeId,
                    EmployeeName = employeeName // Only FirstName exists in Access DB
                    // MatchScore removed - does not exist in Access database
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to retrieve shift", message = ex.Message });
            }
        }

        // POST: api/Shifts
        [HttpPost]
        [Authorize(Roles = "Manager")]
        public async Task<ActionResult<Shift>> CreateShift([FromBody] CreateShiftDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var shift = new Shift
                {
                    StoreId = dto.StoreId,
                    StartTime = dto.StartTime,
                    EndTime = dto.EndTime,
                    RequiredProductivity = dto.RequiredProductivity,
                    EmployeeId = dto.EmployeeId
                    // MatchScore removed - does not exist in Access database
                };

                _db.Shifts.Add(shift);
                await _db.SaveChangesAsync();

                return CreatedAtAction(nameof(GetShift), new { id = shift.ShiftId }, shift);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to create shift", message = ex.Message });
            }
        }

        // PUT: api/Shifts/5
        [HttpPut("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> UpdateShift(int id, [FromBody] UpdateShiftDto dto)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(id);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                shift.StoreId = dto.StoreId;
                shift.StartTime = dto.StartTime;
                shift.EndTime = dto.EndTime;
                shift.RequiredProductivity = dto.RequiredProductivity;
                shift.EmployeeId = dto.EmployeeId;
                // MatchScore removed - does not exist in Access database

                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to update shift", message = ex.Message });
            }
        }

        // DELETE: api/Shifts/5
        [HttpDelete("{id}")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> DeleteShift(int id)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(id);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                _db.Shifts.Remove(shift);
                await _db.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to delete shift", message = ex.Message });
            }
        }

        // POST: api/Shifts/cleanup
        // CRITICAL: Delete ALL shifts and recreate exactly 14 for current week
        [HttpPost("cleanup")]
        public async Task<IActionResult> CleanupShifts([FromQuery] int? storeId = null)
        {
            try
            {
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("CLEANING UP SHIFTS - Deleting ALL and recreating exactly 14");
                Console.WriteLine("═══════════════════════════════════════════════════════");
                
                var storesToProcess = new List<int>();
                if (storeId.HasValue)
                {
                    storesToProcess.Add(storeId.Value);
                }
                else
                {
                    storesToProcess = await _db.Stores.Select(s => s.StoreId).ToListAsync();
                }
                
                int totalDeleted = 0;
                int totalCreated = 0;
                var today = DateTime.Today;
                var monday = today.AddDays(-(int)today.DayOfWeek + 1);
                if (today.DayOfWeek == DayOfWeek.Sunday)
                {
                    monday = today.AddDays(-6);
                }
                monday = monday.Date;
                var weekEnd = monday.AddDays(7);
                
                foreach (var storeIdValue in storesToProcess)
                {
                    // Delete ALL existing shifts for this week
                    var existingShifts = await _db.Shifts
                        .Where(s => s.StoreId == storeIdValue && 
                                   s.StartTime >= monday && 
                                   s.StartTime < weekEnd)
                        .ToListAsync();
                    
                    if (existingShifts.Count > 0)
                    {
                        Console.WriteLine($"⚠ Store {storeIdValue}: Found {existingShifts.Count} shifts. Deleting ALL...");
                        _db.Shifts.RemoveRange(existingShifts);
                        await _db.SaveChangesAsync();
                        totalDeleted += existingShifts.Count;
                        Console.WriteLine($"✓ Deleted {existingShifts.Count} shifts for store {storeIdValue}");
                    }
                    
                        // Create EXACTLY 14 shifts with SlotNumber 1-14
                        var shiftsToCreate = new List<Shift>();
                        int slotNumber = 1;
                        for (int day = 0; day < 7; day++)
                        {
                            var currentDay = monday.AddDays(day);
                            
                            // Morning shift: 9:00 - 15:00
                            shiftsToCreate.Add(new Shift
                            {
                                StoreId = storeIdValue,
                                StartTime = currentDay.AddHours(9),
                                EndTime = currentDay.AddHours(15),
                                RequiredProductivity = 2500,
                                SlotNumber = slotNumber++ // Monday Morning = 1, Tuesday Morning = 3, etc.
                            });
                            
                            // Afternoon shift: 15:00 - 21:00
                            shiftsToCreate.Add(new Shift
                            {
                                StoreId = storeIdValue,
                                StartTime = currentDay.AddHours(15),
                                EndTime = currentDay.AddHours(21),
                                RequiredProductivity = 3500,
                                SlotNumber = slotNumber++ // Monday Afternoon = 2, Tuesday Afternoon = 4, etc.
                            });
                        }
                    
                    _db.Shifts.AddRange(shiftsToCreate);
                    await _db.SaveChangesAsync();
                    totalCreated += shiftsToCreate.Count;
                    
                    // Verify we have exactly 14
                    var finalCount = await _db.Shifts
                        .Where(s => s.StoreId == storeIdValue && 
                                   s.StartTime >= monday && 
                                   s.StartTime < weekEnd)
                        .CountAsync();
                    
                    Console.WriteLine($"✓ Store {storeIdValue}: Created {shiftsToCreate.Count} shifts, verified count: {finalCount}");
                    
                    if (finalCount != 14)
                    {
                        Console.WriteLine($"❌ ERROR: Store {storeIdValue} has {finalCount} shifts, not 14!");
                    }
                }
                
                Console.WriteLine($"═══════════════════════════════════════════════════════");
                Console.WriteLine($"✓ CLEANUP COMPLETE:");
                Console.WriteLine($"  Deleted: {totalDeleted} shifts");
                Console.WriteLine($"  Created: {totalCreated} shifts (should be {storesToProcess.Count * 14})");
                Console.WriteLine($"═══════════════════════════════════════════════════════");
                
                return Ok(new { 
                    message = $"Cleaned up shifts: Deleted {totalDeleted}, Created {totalCreated}",
                    deletedCount = totalDeleted,
                    createdCount = totalCreated
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error cleaning up shifts: {ex.Message}");
                return StatusCode(500, new { error = "Failed to cleanup shifts", message = ex.Message });
            }
        }

        // POST: api/Shifts/reinitialize
        // Reinitialize shifts - deletes existing shifts and recreates them for current week and next 4 weeks
        [HttpPost("reinitialize")]
        public async Task<IActionResult> ReinitializeShifts([FromQuery] int? storeId = null)
        {
            try
            {
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("REINITIALIZING SHIFTS (Deleting and Recreating)");
                Console.WriteLine("═══════════════════════════════════════════════════════");

                var storesToProcess = new List<int>();
                
                if (storeId.HasValue)
                {
                    var store = await _db.Stores.FindAsync(storeId.Value);
                    if (store == null)
                    {
                        return NotFound(new { error = "Store not found" });
                    }
                    storesToProcess.Add(storeId.Value);
                    Console.WriteLine($"Reinitializing shifts for store {storeId.Value} ({store.Name})");
                }
                else
                {
                    // Process all stores
                    var allStores = await _db.Stores.Select(s => s.StoreId).ToListAsync();
                    storesToProcess.AddRange(allStores);
                    Console.WriteLine($"Reinitializing shifts for {allStores.Count} stores");
                }

                if (storesToProcess.Count == 0)
                {
                    return BadRequest(new { error = "No stores found. Please create stores first." });
                }

                int totalShiftsDeleted = 0;
                int totalShiftsCreated = 0;
                var today = DateTime.Today;
                
                // Process ONLY current week (1 week, not 5 weeks) - we only need 14 shifts total
                for (int weekOffset = 0; weekOffset < 1; weekOffset++)
                {
                    var weekStart = today.AddDays(-(int)today.DayOfWeek + 1 + (weekOffset * 7)); // Monday of the week
                    if (today.DayOfWeek == DayOfWeek.Sunday)
                    {
                        weekStart = today.AddDays(-6 + (weekOffset * 7)); // Adjust for Sunday
                    }
                    weekStart = weekStart.Date; // Ensure it's at midnight
                    var weekEnd = weekStart.AddDays(7);
                    
                    foreach (var storeIdValue in storesToProcess)
                    {
                        // Delete shifts by raw SQL to avoid materializing rows with NULL columns (DBNull cast errors)
                        var deleted = await _db.Database.ExecuteSqlRawAsync(
                            "DELETE FROM Shifts WHERE Shift_StoreID = {0} AND Shift_StartTime >= {1} AND Shift_StartTime < {2}",
                            storeIdValue, weekStart, weekEnd);
                        if (deleted > 0)
                        {
                            totalShiftsDeleted += deleted;
                            Console.WriteLine($"✓ Deleted {deleted} existing shifts for store {storeIdValue}, week {weekStart:yyyy-MM-dd}");
                        }
                        
                        // Create new shifts: 14 shifts (7 days × 2 shifts per day) with SlotNumber 1-14
                        Console.WriteLine($"Creating 14 new shifts for store {storeIdValue}, week starting {weekStart:yyyy-MM-dd}...");
                        
                        var shiftsToCreate = new List<Shift>();
                        
                        for (int day = 0; day < 7; day++)
                        {
                            var currentDay = weekStart.AddDays(day);
                            
                            // Morning shift: 9:00 - 15:00
                            var morningStart = currentDay.AddHours(9);
                            var morningEnd = currentDay.AddHours(15);
                            shiftsToCreate.Add(new Shift
                            {
                                StoreId = storeIdValue,
                                StartTime = morningStart,
                                EndTime = morningEnd,
                                RequiredProductivity = 2500,
                                SlotNumber = day * 2 + 1
                            });
                            
                            // Afternoon shift: 15:00 - 21:00
                            var afternoonStart = currentDay.AddHours(15);
                            var afternoonEnd = currentDay.AddHours(21);
                            shiftsToCreate.Add(new Shift
                            {
                                StoreId = storeIdValue,
                                StartTime = afternoonStart,
                                EndTime = afternoonEnd,
                                RequiredProductivity = 3500,
                                SlotNumber = day * 2 + 2
                            });
                        }
                        
                        _db.Shifts.AddRange(shiftsToCreate);
                        await _db.SaveChangesAsync();
                        totalShiftsCreated += shiftsToCreate.Count;
                        Console.WriteLine($"✓ Created {shiftsToCreate.Count} shifts for store {storeIdValue}, week {weekStart:yyyy-MM-dd}");
                    }
                }

                Console.WriteLine($"═══════════════════════════════════════════════════════");
                Console.WriteLine($"✓ REINITIALIZATION COMPLETE:");
                Console.WriteLine($"  Deleted: {totalShiftsDeleted} shifts");
                Console.WriteLine($"  Created: {totalShiftsCreated} shifts");
                Console.WriteLine($"═══════════════════════════════════════════════════════");

                return Ok(new { 
                    message = $"Successfully reinitialized shifts",
                    shiftsDeleted = totalShiftsDeleted,
                    shiftsCreated = totalShiftsCreated,
                    stores = storesToProcess.Count
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error reinitializing shifts: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = "Failed to reinitialize shifts", message = ex.Message });
            }
        }

        // POST: api/Shifts/seed
        // Seed shifts for all stores - creates 14 shifts (7 days × 2 shifts) for the current week and next 4 weeks
        [HttpPost("seed")]
        public async Task<IActionResult> SeedShifts([FromQuery] int? storeId = null)
        {
            try
            {
                Console.WriteLine("═══════════════════════════════════════════════════════");
                Console.WriteLine("SEEDING SHIFTS");
                Console.WriteLine("═══════════════════════════════════════════════════════");

                var storesToSeed = new List<int>();
                
                if (storeId.HasValue)
                {
                    var store = await _db.Stores.FindAsync(storeId.Value);
                    if (store == null)
                    {
                        return NotFound(new { error = "Store not found" });
                    }
                    storesToSeed.Add(storeId.Value);
                    Console.WriteLine($"Seeding shifts for store {storeId.Value} ({store.Name})");
                }
                else
                {
                    // Seed for all stores
                    var allStores = await _db.Stores.Select(s => s.StoreId).ToListAsync();
                    storesToSeed.AddRange(allStores);
                    Console.WriteLine($"Seeding shifts for {allStores.Count} stores");
                }

                if (storesToSeed.Count == 0)
                {
                    return BadRequest(new { error = "No stores found. Please create stores first." });
                }

                int totalShiftsCreated = 0;
                var today = DateTime.Today;
                
                // Create shifts for current week ONLY (1 week, not 5 weeks) - exactly 14 shifts
                for (int weekOffset = 0; weekOffset < 1; weekOffset++)
                {
                    var weekStart = today.AddDays(-(int)today.DayOfWeek + 1 + (weekOffset * 7)); // Monday of the week
                    if (today.DayOfWeek == DayOfWeek.Sunday)
                    {
                        weekStart = today.AddDays(-6 + (weekOffset * 7)); // Adjust for Sunday
                    }
                    
                    foreach (var storeIdValue in storesToSeed)
                    {
                        // Check if shifts already exist for this week and store
                        var weekEnd = weekStart.AddDays(7);
                        var existingShifts = await _db.Shifts
                            .Where(s => s.StoreId == storeIdValue && 
                                       s.StartTime >= weekStart && 
                                       s.StartTime < weekEnd)
                            .CountAsync();

                        // Delete existing shifts if there are more than 14 or if we need to recreate
                        if (existingShifts > 14)
                        {
                            Console.WriteLine($"⚠ Week {weekStart:yyyy-MM-dd} for store {storeIdValue}: Has {existingShifts} shifts (should be 14). Deleting all and recreating...");
                            var shiftsToDelete = await _db.Shifts
                                .Where(s => s.StoreId == storeIdValue && 
                                           s.StartTime >= weekStart && 
                                           s.StartTime < weekEnd)
                                .ToListAsync();
                            _db.Shifts.RemoveRange(shiftsToDelete);
                            await _db.SaveChangesAsync();
                            existingShifts = 0;
                        }

                        if (existingShifts == 14)
                        {
                            Console.WriteLine($"✓ Week {weekStart:yyyy-MM-dd} for store {storeIdValue}: Already has exactly 14 shifts");
                            continue;
                        }

                        Console.WriteLine($"Creating exactly 14 shifts for store {storeIdValue}, week starting {weekStart:yyyy-MM-dd}...");
                        
                        var shiftsToCreate = new List<Shift>();
                        
                        // Create EXACTLY 14 shifts: 7 days × 2 shifts per day (Monday-Sunday)
                        for (int day = 0; day < 7; day++)
                        {
                            var currentDay = weekStart.AddDays(day);
                            
                            // Morning shift: 9:00 - 15:00
                            shiftsToCreate.Add(new Shift
                            {
                                StoreId = storeIdValue,
                                StartTime = currentDay.AddHours(9),
                                EndTime = currentDay.AddHours(15),
                                RequiredProductivity = 2500
                            });
                            
                            // Afternoon shift: 15:00 - 21:00
                            shiftsToCreate.Add(new Shift
                            {
                                StoreId = storeIdValue,
                                StartTime = currentDay.AddHours(15),
                                EndTime = currentDay.AddHours(21),
                                RequiredProductivity = 3500
                            });
                        }
                        
                        // Verify we're creating exactly 14 shifts
                        if (shiftsToCreate.Count != 14)
                        {
                            Console.WriteLine($"❌ ERROR: Expected 14 shifts, but got {shiftsToCreate.Count}");
                            continue;
                        }
                        
                        _db.Shifts.AddRange(shiftsToCreate);
                        await _db.SaveChangesAsync();
                        totalShiftsCreated += shiftsToCreate.Count;
                        Console.WriteLine($"✓ Created {shiftsToCreate.Count} shifts for store {storeIdValue}, week {weekStart:yyyy-MM-dd}");
                    }
                }

                Console.WriteLine($"═══════════════════════════════════════════════════════");
                Console.WriteLine($"✓ SEEDING COMPLETE: Created {totalShiftsCreated} shifts total");
                Console.WriteLine($"═══════════════════════════════════════════════════════");

                return Ok(new { 
                    message = $"Successfully seeded {totalShiftsCreated} shifts",
                    shiftsCreated = totalShiftsCreated,
                    stores = storesToSeed.Count
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error seeding shifts: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = "Failed to seed shifts", message = ex.Message });
            }
        }

        // POST: api/Shifts/5/assign
        [HttpPost("{id}/assign")]
        [Authorize(Roles = "Manager")]
        public async Task<IActionResult> AssignEmployee(int id, [FromBody] AssignEmployeeDto dto)
        {
            try
            {
                var shift = await _db.Shifts.FindAsync(id);
                if (shift == null)
                {
                    return NotFound(new { error = "Shift not found" });
                }

                if (dto.EmployeeId.HasValue)
                {
                    var employee = await _db.Employees.FindAsync(dto.EmployeeId.Value);
                    if (employee == null)
                    {
                        return NotFound(new { error = "Employee not found" });
                    }
                    
                    // CRITICAL: Clean up any invalid availability records (ShiftId <= 0) for this employee FIRST
                    // These are invalid because Access AutoNumber starts at 1, not 0
                    var invalidRecords = await _db.Availabilities
                        .Where(a => a.EmployeeId == employee.EmployeeId && a.ShiftId <= 0)
                        .ToListAsync();
                    
                    if (invalidRecords.Count > 0)
                    {
                        Console.WriteLine($"⚠ Found {invalidRecords.Count} invalid availability records with ShiftId <= 0 for employee {employee.EmployeeId}. Deleting them...");
                        _db.Availabilities.RemoveRange(invalidRecords);
                        await _db.SaveChangesAsync();
                        Console.WriteLine($"✓ Deleted {invalidRecords.Count} invalid availability record(s)");
                    }
                    
                    // Check if employee is available for this shift BY SLOT NUMBER (1-14), not by ShiftId.
                    // So even if shifts were recreated (new IDs), we match by slot.
                    var shiftSlotNumber = shift.SlotNumber ?? 0;
                    if (shiftSlotNumber < 1 || shiftSlotNumber > 14)
                    {
                        Console.WriteLine($"❌ Shift {shift.ShiftId} has invalid SlotNumber {shiftSlotNumber}. Must be 1-14.");
                        return BadRequest(new { error = "Invalid shift", message = "This shift has no slot number (1-14). Refresh the schedule." });
                    }
                    var availabilityCheck = await _db.Availabilities
                        .Where(a => a.EmployeeId == employee.EmployeeId && a.IsAvailable == true)
                        .Join(_db.Shifts.Where(s => s.SlotNumber >= 1 && s.SlotNumber <= 14),
                            a => a.ShiftId,
                            s => s.ShiftId,
                            (a, s) => new { a, s.SlotNumber })
                        .Where(x => x.SlotNumber == shiftSlotNumber)
                        .Select(x => x.a)
                        .OrderByDescending(a => a.AvailabilityId)
                        .FirstOrDefaultAsync();
                    
                    var totalAvailableForShift = await _db.Availabilities
                        .Where(a => a.ShiftId == shift.ShiftId && a.IsAvailable == true)
                        .CountAsync();
                    
                    Console.WriteLine($"═══════════════════════════════════════════════════════");
                    Console.WriteLine($"ASSIGNMENT CHECK (by SlotNumber 1-14):");
                    Console.WriteLine($"  Shift ID: {shift.ShiftId}, SlotNumber: {shiftSlotNumber}");
                    Console.WriteLine($"  Employee ID: {employee.EmployeeId}");
                    Console.WriteLine($"  Total employees available for this shift: {totalAvailableForShift}");
                    Console.WriteLine($"  Availability for this slot found: {availabilityCheck != null}");
                    Console.WriteLine($"═══════════════════════════════════════════════════════");
                    
                    bool isAvailable = availabilityCheck != null && availabilityCheck.IsAvailable == true;
                    
                    if (!isAvailable)
                    {
                        var anyForSlot = await _db.Availabilities
                            .Where(a => a.EmployeeId == employee.EmployeeId)
                            .Join(_db.Shifts.Where(s => s.SlotNumber == shiftSlotNumber),
                                a => a.ShiftId,
                                s => s.ShiftId,
                                (a, s) => a)
                            .AnyAsync();
                        string reason = anyForSlot
                            ? "Employee has a record for this slot but is not marked available. They need to set availability on the availability page."
                            : "No availability for this slot (1-14). Employee needs to set their availability first on the availability page.";
                        Console.WriteLine($"❌ ASSIGNMENT BLOCKED: {reason}");
                        return BadRequest(new { 
                            error = "Employee not available", 
                            message = $"This employee has not marked themselves as available for this shift. {reason}" 
                        });
                    }
                    
                    Console.WriteLine($"✓ Employee {employee.EmployeeId} is available for shift {shift.ShiftId} - assignment allowed");
                }

                shift.EmployeeId = dto.EmployeeId;
                // MatchScore removed - does not exist in Access database

                await _db.SaveChangesAsync();

                return Ok(new { message = "Employee assigned successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to assign employee", message = ex.Message });
            }
        }
    }

    public class CreateShiftDto
    {
        public int StoreId { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public decimal RequiredProductivity { get; set; }
        public int? EmployeeId { get; set; }
        // MatchScore removed - does not exist in Access database
    }

    public class UpdateShiftDto
    {
        public int StoreId { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public decimal RequiredProductivity { get; set; }
        public int? EmployeeId { get; set; }
        // MatchScore removed - does not exist in Access database
    }

    public class AssignEmployeeDto
    {
        public int? EmployeeId { get; set; }
        // MatchScore removed - does not exist in Access database
    }
}


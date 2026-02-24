import React, { useState, useEffect, useRef } from 'react';

interface Shift {
  shiftId: number;
  slotNumber: number; // SlotNumber 1-14 (Monday Morning=1, Monday Afternoon=2, ..., Sunday Afternoon=14)
  storeId: number;
  storeName?: string;
  startTime: string;
  endTime: string;
  requiredProductivity: number;
  employeeId?: number;
  employeeName?: string;
  matchScore?: number;
}

interface User {
  userId: number;
  fullName: string;
  email: string;
  storeId: number;
  storeName?: string;
}

interface EmployeeAvailabilityProps {
  user: User;
}

const EmployeeAvailability: React.FC<EmployeeAvailabilityProps> = ({ user }) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  // Use SlotNumber (1-14) as key instead of ShiftId for organization
  const [availabilityMap, setAvailabilityMap] = useState<Map<number, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSlotNumber, setSavingSlotNumber] = useState<number | null>(null);
  const [lastSavedSlotNumber, setLastSavedSlotNumber] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // Get Monday of current week
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Get week range text
  const getWeekRange = () => {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${currentWeekStart.toLocaleDateString('en-US', options)} - ${weekEnd.toLocaleDateString('en-US', options)}`;
  };

  // Fetch availability from backend - keyed by SlotNumber (1-14)
  const fetchAvailability = async () => {
    try {
      console.log(`🔄 Fetching availability from Access database for employee ${user.userId}...`);
      
      const response = await fetch(`/api/availabilities/all-for-employee/${user.userId}`, {
        credentials: 'include',
        cache: 'no-cache' // Always get fresh data from database
      });

      if (response.ok) {
        const data = await response.json();
        const raw = data.availabilityMap || {};
        const newMap = new Map<number, boolean>();
        for (let slot = 1; slot <= 14; slot++) {
          const v = raw[String(slot)] ?? raw[slot];
          newMap.set(slot, v === true);
        }
        setAvailabilityMap(newMap);
      } else {
        console.warn(`⚠ Failed to fetch availability (${response.status})`);
        const newMap = new Map<number, boolean>();
        for (let slot = 1; slot <= 14; slot++) newMap.set(slot, false);
        setAvailabilityMap(newMap);
      }
    } catch (err) {
      console.error('❌ Error fetching availability from database:', err);
      const newMap = new Map<number, boolean>();
      for (let slot = 1; slot <= 14; slot++) newMap.set(slot, false);
      setAvailabilityMap(newMap);
    }
  };

  // Fetch shifts for current week
  const fetchShifts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load saved availability FIRST so slots show as available after refresh (before we depend on shifts).
      try {
        const availRes = await fetch(`/api/availabilities/all-for-employee/${user.userId}`, {
          credentials: 'include',
          cache: 'no-cache',
        });
        if (availRes.ok) {
          const data = await availRes.json();
          const raw = data.availabilityMap || {};
          const newMap = new Map<number, boolean>();
          for (let slot = 1; slot <= 14; slot++) {
            const v = raw[String(slot)] ?? raw[slot];
            newMap.set(slot, v === true);
          }
          setAvailabilityMap(newMap);
        }
      } catch (_) {
        /* ignore */
      }

      // Format week start as ISO string
      const weekStartISO = currentWeekStart.toISOString();
      
      const response = await fetch(`/api/shifts?storeId=${user.storeId}&weekStart=${weekStartISO}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch shifts: ${response.status}`);
      }

      const data = await response.json();
      
      console.log(`📥 Raw backend response (first 3 shifts):`, data.slice(0, 3));
      
      // Map backend response to frontend format - MUST use SlotNumber (1-14)
      const mappedShifts = data.map((s: any) => {
        const shiftId = s.ShiftId !== undefined ? s.ShiftId : (s.shiftId !== undefined ? s.shiftId : null);
        const slotNumber = s.SlotNumber !== undefined ? s.SlotNumber : (s.slotNumber !== undefined ? s.slotNumber : null);
        
        // CRITICAL: Validate SlotNumber - must be between 1 and 14
        if (slotNumber === null || slotNumber === undefined || slotNumber < 1 || slotNumber > 14 || isNaN(Number(slotNumber))) {
          console.error(`❌ Invalid SlotNumber: ${slotNumber} (must be 1-14). Skipping shift.`);
          return null; // Filter out invalid shifts
        }
        
        return {
          shiftId: Number(shiftId), // Actual Shift_ID from database
          slotNumber: Number(slotNumber), // SlotNumber 1-14 for organization
          storeId: s.StoreId || s.storeId,
          storeName: s.StoreName || s.storeName,
          startTime: s.StartTime || s.startTime,
          endTime: s.EndTime || s.endTime,
          requiredProductivity: s.RequiredProductivity || s.requiredProductivity,
          employeeId: s.EmployeeId || s.employeeId,
          employeeName: s.EmployeeName || s.employeeName
        };
      }).filter((s): s is Shift => s !== null)
        .sort((a, b) => a.slotNumber - b.slotNumber); // Sort by SlotNumber (1-14)

      // CRITICAL: We must have exactly 14 shifts with SlotNumbers 1-14
      if (mappedShifts.length !== 14) {
        console.error(`❌ CRITICAL: Expected 14 shifts, but got ${mappedShifts.length}!`);
        const slotNumbers = mappedShifts.map(s => s.slotNumber).sort((a, b) => a - b);
        console.error(`   SlotNumbers found: [${slotNumbers.join(', ')}]`);
        alert(`Warning: Expected 14 shifts but found ${mappedShifts.length}. Please click "Reinitialize Shifts" to fix this.`);
      } else {
        const slotNumbers = mappedShifts.map(s => s.slotNumber).sort((a, b) => a - b);
        const hasAllSlots = slotNumbers.every((slot, index) => slot === index + 1);
        if (!hasAllSlots) {
          console.error(`❌ CRITICAL: Missing slots! Expected 1-14, got: [${slotNumbers.join(', ')}]`);
          alert(`Warning: Missing slots. Expected SlotNumbers 1-14, but got: [${slotNumbers.join(', ')}]. Please click "Reinitialize Shifts".`);
        } else {
          console.log(`✅ Successfully mapped exactly 14 shifts with SlotNumbers 1-14`);
          console.log(`   SlotNumbers: [${slotNumbers.join(', ')}]`);
        }
      }
      
      setShifts(mappedShifts);

      // Reload availability again after shifts so we have latest from DB (keys 1-14)
      try {
        const allAvailabilityResponse = await fetch(`/api/availabilities/all-for-employee/${user.userId}`, {
          credentials: 'include',
          cache: 'no-cache',
        });
        if (allAvailabilityResponse.ok) {
          const allAvailabilityData = await allAvailabilityResponse.json();
          const raw = allAvailabilityData.availabilityMap || {};
          const newMap = new Map<number, boolean>();
          for (let slot = 1; slot <= 14; slot++) {
            const v = raw[String(slot)] ?? raw[slot];
            newMap.set(slot, v === true);
          }
          setAvailabilityMap(newMap);
        }
      } catch (_) {
        /* ignore */
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load shifts');
      console.error('Error fetching shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Always fetch fresh data when component mounts or dependencies change
  // This ensures the UI always reflects the current state in the Access database
  useEffect(() => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 PAGE LOAD/REFRESH: Fetching shifts and availability from Access database...');
    console.log(`  Employee ID: ${user.userId}`);
    console.log(`  Store ID: ${user.storeId}`);
    console.log(`  Week Start: ${currentWeekStart.toISOString()}`);
    console.log('═══════════════════════════════════════════════════════');

    // Single flow: load shifts and availability. Employee sets which shifts they're available for (one record per shift).
    fetchShifts();
  }, [currentWeekStart, user.storeId, user.userId]);

  // Also fetch when page becomes visible again (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Page became visible, refreshing availability...');
        // Use a small delay to avoid conflicts with other fetches
        setTimeout(() => {
          fetchShifts();
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentWeekStart, user.storeId, user.userId]);

  // Track pending saves to prevent race conditions
  const pendingSavesRef = useRef<Set<number>>(new Set());
  
  // Toggle availability for a slot (SlotNumber 1-14)
  const toggleAvailability = async (slotNumber: number) => {
    try {
      // CRITICAL: Validate SlotNumber - must be between 1 and 14
      if (!slotNumber || slotNumber < 1 || slotNumber > 14 || isNaN(slotNumber)) {
        console.error(`❌ Invalid SlotNumber: ${slotNumber}. Must be 1-14.`);
        alert(`Error: Invalid slot number (${slotNumber}). Please refresh the page.`);
        return;
      }
      
      // Prevent multiple simultaneous saves for the same slot
      if (pendingSavesRef.current.has(slotNumber)) {
        console.warn(`⚠ Save already in progress for slot ${slotNumber}. Ignoring duplicate request.`);
        return;
      }
      
      // Find the shift by SlotNumber
      const shift = shifts.find(s => s.slotNumber === slotNumber);
      if (!shift) {
        console.error(`❌ SlotNumber ${slotNumber} not found in loaded shifts.`);
        alert(`Error: Slot not found. Please refresh the page.`);
        return;
      }
      
      const currentState = availabilityMap.get(slotNumber) || false;
      const targetState = !currentState; // Toggle the state
      
      console.log(`═══════════════════════════════════════════════════════`);
      console.log(`TOGGLE AVAILABILITY (Frontend):`);
      console.log(`  SlotNumber: ${slotNumber} (1-14)`);
      console.log(`  Shift_ID: ${shift.shiftId}`);
      console.log(`  EmployeeId: ${user.userId}`);
      console.log(`  Current state: ${currentState} → Target state: ${targetState}`);
      console.log(`═══════════════════════════════════════════════════════`);
      
      // Mark this slot as being saved
      pendingSavesRef.current.add(slotNumber);
      setSavingSlotNumber(slotNumber);
      
      // Optimistically update UI using SlotNumber as key
      setAvailabilityMap(prev => {
        const newMap = new Map(prev);
        newMap.set(slotNumber, targetState);
        return newMap;
      });
      
      // Save THIS slot only to Access (slots 1-14 hard-coded)
      await saveOneSlot(slotNumber, targetState);
      
      // Remove from pending saves
      pendingSavesRef.current.delete(slotNumber);
      setSavingSlotNumber(null);

      // Show success indicator
      setLastSavedSlotNumber(slotNumber);
      setTimeout(() => setLastSavedSlotNumber(null), 2000); // Hide after 2 seconds
    } catch (err: any) {
      setSavingSlotNumber(null);
      pendingSavesRef.current.delete(slotNumber);
      
      // Revert optimistic update on error - get previous state from map
      setAvailabilityMap(prev => {
        const newMap = new Map(prev);
        const prevState = prev.get(slotNumber) || false;
        newMap.set(slotNumber, prevState); // Revert to previous state
        return newMap;
      });
      
      alert(`Error: ${err.message}`);
      console.error('Error toggling availability:', err);
    }
  };

  // Save employee availability for one shift (1-14). One shift = one row in Availabilities. Not manager "set shift".
  const saveOneSlot = async (slotNumber: number, isAvailable: boolean) => {
    const response = await fetch('/api/availabilities/set-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        employeeId: user.userId,
        slotNumber,
        isAvailable,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${response.status}`);
    }
    return response.json();
  };

  // Save ALL 14 slots one-by-one (each slot saved alone to Access)
  const saveAllAvailability = async () => {
    try {
      setSavingAll(true);
      for (let slot = 1; slot <= 14; slot++) {
        const isAvailable = availabilityMap.get(slot) ?? false;
        await saveOneSlot(slot, isAvailable);
      }
      await fetchAvailability();
      return {};
    } catch (err: any) {
      console.error('Error saving availability:', err);
      throw err;
    } finally {
      setSavingAll(false);
    }
  };

  // Format time from ISO string
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Format date
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Organize shifts by SlotNumber (1-14) - create a map for easy lookup
  const shiftsBySlotNumber = new Map<number, Shift>();
  shifts.forEach(shift => {
    if (shift.slotNumber >= 1 && shift.slotNumber <= 14) {
      shiftsBySlotNumber.set(shift.slotNumber, shift);
    }
  });
  
  // Group shifts by day for display
  const shiftsByDay = shifts.reduce((acc, shift) => {
    const date = new Date(shift.startTime);
    const dayKey = date.toDateString();
    if (!acc[dayKey]) {
      acc[dayKey] = [];
    }
    acc[dayKey].push(shift);
    // Sort by SlotNumber within each day
    acc[dayKey].sort((a, b) => a.slotNumber - b.slotNumber);
    return acc;
  }, {} as Record<string, Shift[]>);

  // Get days of the week
  const daysOfWeek = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    daysOfWeek.push(date);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl shadow-blue-500/10 border border-slate-200/50 p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 bg-clip-text text-transparent mb-2">
                My Availability
              </h1>
              <p className="text-slate-600">Set your availability for shifts this week</p>
              <p className="text-xs text-slate-500 mt-1 flex items-center">
                <i className="fas fa-info-circle mr-1"></i>
                Your availability is automatically saved and will persist when you refresh or return to this page
              </p>
            </div>
            
            <div className="flex items-center space-x-4 flex-wrap gap-2">
              {/* Save All Availability Button */}
              <button
                onClick={async () => {
                  setSavingAll(true);
                  try {
                    await saveAllAvailability();
                    alert('✓ All availability slots saved successfully!');
                  } catch (err: any) {
                    alert(`Error: ${err.message}`);
                  } finally {
                    setSavingAll(false);
                  }
                }}
                disabled={savingAll || loading}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                title="Save all availability slots at once"
              >
                <i className={`fas ${savingAll ? 'fa-spinner fa-spin' : 'fa-save'} mr-2`}></i>
                {savingAll ? 'Saving All...' : '💾 Save All Availability'}
              </button>
              
              {/* Reinitialize Shifts Button */}
              <button
                onClick={async () => {
                  if (!confirm('This will delete all existing shifts and recreate exactly 14 shifts for the current week. Continue?')) {
                    return;
                  }
                  try {
                    setLoading(true);
                    const response = await fetch(`/api/shifts/reinitialize?storeId=${user.storeId}`, {
                      method: 'POST',
                      credentials: 'include'
                    });
                    if (response.ok) {
                      const data = await response.json();
                      alert(`Success! ${data.message}\nDeleted: ${data.shiftsDeleted} shifts\nCreated: ${data.shiftsCreated} shifts`);
                      fetchShifts(); // Refresh the page
                    } else {
                      const errorData = await response.json().catch(() => ({}));
                      alert(`Error: ${errorData.message || errorData.error || 'Failed to reinitialize shifts'}`);
                    }
                  } catch (err: any) {
                    alert(`Error: ${err.message}`);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="px-4 py-2 bg-orange-100 hover:bg-orange-200 rounded-lg font-bold text-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Reinitialize all shifts (delete and recreate)"
              >
                <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-redo'} mr-2`}></i>
                {loading ? 'Reinitializing...' : 'Reinitialize Shifts'}
              </button>
              
              {/* Cleanup Extra Shifts Button */}
              <button
                onClick={async () => {
                  if (!confirm('This will delete any extra shifts (keeping only 14 per week). Continue?')) {
                    return;
                  }
                  try {
                    setLoading(true);
                    const response = await fetch(`/api/shifts/cleanup?storeId=${user.storeId}`, {
                      method: 'POST',
                      credentials: 'include'
                    });
                    if (response.ok) {
                      const data = await response.json();
                      alert(`Success! ${data.message}\nDeleted: ${data.deletedCount} extra shifts`);
                      fetchShifts(); // Refresh the page
                    } else {
                      const errorData = await response.json().catch(() => ({}));
                      alert(`Error: ${errorData.message || errorData.error || 'Failed to cleanup shifts'}`);
                    }
                  } catch (err: any) {
                    alert(`Error: ${err.message}`);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="px-4 py-2 bg-yellow-100 hover:bg-yellow-200 rounded-lg font-bold text-yellow-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete extra shifts (keep only 14 per week)"
              >
                <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-broom'} mr-2`}></i>
                {loading ? 'Cleaning...' : 'Cleanup Extra Shifts'}
              </button>
              
              {/* Refresh Button */}
              <button
                onClick={() => {
                  console.log('🔄 Manual refresh triggered');
                  fetchShifts();
                }}
                disabled={loading}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-lg font-bold text-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh availability from database"
              >
                <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-2`}></i>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            
            {/* Week Navigation */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  const newWeek = new Date(currentWeekStart);
                  newWeek.setDate(newWeek.getDate() - 7);
                  setCurrentWeekStart(newWeek);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700 transition-all"
              >
                <i className="fas fa-chevron-left mr-2"></i>
                Previous Week
              </button>
              <div className="px-6 py-2 bg-blue-100 rounded-lg font-bold text-blue-700">
                {getWeekRange()}
              </div>
              <button
                onClick={() => {
                  const newWeek = new Date(currentWeekStart);
                  newWeek.setDate(newWeek.getDate() + 7);
                  setCurrentWeekStart(newWeek);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700 transition-all"
              >
                Next Week
                <i className="fas fa-chevron-right ml-2"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6">
            <p className="text-red-700 font-bold">
              <i className="fas fa-exclamation-circle mr-2"></i>
              {error}
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <i className="fas fa-spinner fa-spin text-4xl text-blue-500 mb-4"></i>
            <p className="text-slate-600 font-bold">Loading shifts...</p>
          </div>
        ) : shifts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <i className="fas fa-calendar-times text-4xl text-slate-400 mb-4"></i>
            <p className="text-slate-600 font-bold text-lg">No shifts scheduled for this week</p>
            <p className="text-slate-500 mt-2">Shifts will appear here once they are created by your manager.</p>
          </div>
        ) : (
          /* Shifts Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {daysOfWeek.map((day, dayIndex) => {
              const dayKey = day.toDateString();
              const dayShifts = shiftsByDay[dayKey] || [];
              
              return (
                <div key={dayIndex} className="bg-white rounded-xl shadow-lg p-4">
                  <div className="border-b-2 border-slate-200 pb-3 mb-3">
                    <h3 className="font-black text-lg text-slate-800">
                      {day.toLocaleDateString('en-US', { weekday: 'long' })}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  {dayShifts.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">No shifts</p>
                  ) : (
                    <div className="space-y-3">
                      {dayShifts.map((shift, shiftIndex) => {
                        // CRITICAL: Use SlotNumber as key (1-14) for availability lookup
                        const shiftSlotNumber = shift.slotNumber;
                        const isAvailable = availabilityMap.get(shiftSlotNumber) || false;
                        
                        // Validate SlotNumber before rendering
                        if (!shiftSlotNumber || shiftSlotNumber < 1 || shiftSlotNumber > 14) {
                          console.error(`❌ Invalid SlotNumber in shift object:`, shift);
                          return null; // Don't render invalid shifts
                        }
                        
                        return (
                          <div
                            key={`shift-${shift.shiftId}-slot-${shiftSlotNumber}`}
                            className={`border-2 rounded-lg p-3 transition-all ${
                              isAvailable
                                ? 'border-green-300 bg-green-50'
                                : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-bold text-slate-800 text-sm">
                                  {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                                </p>
                                {shift.storeName && (
                                  <p className="text-xs text-slate-500 mt-1">{shift.storeName}</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  if (!shiftSlotNumber || shiftSlotNumber < 1 || shiftSlotNumber > 14) {
                                    alert(`Error: Invalid slot number. Please refresh the page.`);
                                    return;
                                  }
                                  toggleAvailability(shiftSlotNumber);
                                }}
                                disabled={savingSlotNumber === shiftSlotNumber || savingAll}
                                className={`ml-2 px-3 py-1 rounded-lg font-bold text-xs transition-all relative ${
                                  isAvailable
                                    ? 'bg-green-500 hover:bg-green-600 text-white'
                                    : 'bg-slate-300 hover:bg-slate-400 text-slate-700'
                                } ${savingSlotNumber === shiftSlotNumber || savingAll ? 'opacity-75 cursor-wait' : ''}`}
                                title={isAvailable ? 'Click to mark as not available' : 'Click to mark as available'}
                              >
                                {savingSlotNumber === shiftSlotNumber || savingAll ? (
                                  <>
                                    <i className="fas fa-spinner fa-spin mr-1"></i>
                                    {savingAll ? 'Saving All...' : 'Saving...'}
                                  </>
                                ) : lastSavedSlotNumber === shiftSlotNumber ? (
                                  <>
                                    <i className="fas fa-check mr-1"></i>
                                    Saved
                                  </>
                                ) : isAvailable ? (
                                  <>
                                    <i className="fas fa-check-circle mr-1"></i>
                                    Available
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-times-circle mr-1"></i>
                                    Not Available
                                  </>
                                )}
                              </button>
                            </div>
                            {shift.employeeId && (
                              <p className="text-xs text-blue-600 mt-2">
                                <i className="fas fa-user-check mr-1"></i>
                                Assigned to: {shift.employeeName || 'You'}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeAvailability;


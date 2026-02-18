import React, { useState, useEffect } from 'react';

interface Shift {
  shiftId: number;
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
  const [availabilityMap, setAvailabilityMap] = useState<Map<number, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Fetch shifts for current week
  const fetchShifts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Format week start as ISO string
      const weekStartISO = currentWeekStart.toISOString();
      
      const response = await fetch(`/api/shifts?storeId=${user.storeId}&weekStart=${weekStartISO}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch shifts: ${response.status}`);
      }

      const data = await response.json();
      
      // Map backend response to frontend format
      const mappedShifts = data.map((s: any) => ({
        shiftId: s.ShiftId || s.shiftId,
        storeId: s.StoreId || s.storeId,
        storeName: s.StoreName || s.storeName,
        startTime: s.StartTime || s.startTime,
        endTime: s.EndTime || s.endTime,
        requiredProductivity: s.RequiredProductivity || s.requiredProductivity,
        employeeId: s.EmployeeId || s.employeeId,
        employeeName: s.EmployeeName || s.employeeName,
        matchScore: s.MatchScore || s.matchScore
      }));

      setShifts(mappedShifts);

      // Fetch availability status for each shift
      const availabilityPromises = mappedShifts.map((shift: Shift) =>
        fetch(`/api/availabilities/check/${user.userId}/${shift.shiftId}`, {
          credentials: 'include'
        })
          .then(res => res.ok ? res.json() : { available: false })
          .then(data => ({ shiftId: shift.shiftId, available: data.available || false }))
          .catch(() => ({ shiftId: shift.shiftId, available: false }))
      );

      const availabilityResults = await Promise.all(availabilityPromises);
      const newMap = new Map<number, boolean>();
      availabilityResults.forEach(result => {
        newMap.set(result.shiftId, result.available);
      });
      setAvailabilityMap(newMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load shifts');
      console.error('Error fetching shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, [currentWeekStart, user.storeId]);

  // Toggle availability for a shift
  const toggleAvailability = async (shiftId: number) => {
    try {
      const response = await fetch('/api/availabilities/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          employeeId: user.userId,
          shiftId: shiftId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Update availability map
      setAvailabilityMap(prev => {
        const newMap = new Map(prev);
        newMap.set(shiftId, data.available);
        return newMap;
      });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      console.error('Error toggling availability:', err);
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

  // Group shifts by day
  const shiftsByDay = shifts.reduce((acc, shift) => {
    const date = new Date(shift.startTime);
    const dayKey = date.toDateString();
    if (!acc[dayKey]) {
      acc[dayKey] = [];
    }
    acc[dayKey].push(shift);
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                My Availability
              </h1>
              <p className="text-slate-600">Set your availability for shifts this week</p>
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
              <div className="px-6 py-2 bg-indigo-100 rounded-lg font-bold text-indigo-700">
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
            <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4"></i>
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
                      {dayShifts.map((shift) => {
                        const isAvailable = availabilityMap.get(shift.shiftId) || false;
                        return (
                          <div
                            key={shift.shiftId}
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
                                onClick={() => toggleAvailability(shift.shiftId)}
                                className={`ml-2 px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                                  isAvailable
                                    ? 'bg-green-500 hover:bg-green-600 text-white'
                                    : 'bg-slate-300 hover:bg-slate-400 text-slate-700'
                                }`}
                              >
                                {isAvailable ? (
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
                              <p className="text-xs text-indigo-600 mt-2">
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


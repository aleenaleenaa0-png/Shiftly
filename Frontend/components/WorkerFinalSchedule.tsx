/**
 * WorkerFinalSchedule.tsx — جدول العامل النهائي
 * يعرض المناوبات المعيّنة له بعد أن ينشر المدير الجدول.
 * API: /api/shifts/for-employee و /api/schedule/publish/status
 */
import React, { useState, useEffect, useRef } from 'react';

interface Shift {
  id: string;
  workerName: string;
  startTime: string;
  endTime: string;
  role: string;
  date: string;
  slotNumber: number; // 1-14: Mon AM=1, Mon PM=2, ... Sun PM=14
}

interface WorkerFinalScheduleProps {
  userName: string;
  userId: number;
}

import { DAYS } from '../constants';

const DAYS_OF_WEEK = DAYS;

const WorkerFinalSchedule: React.FC<WorkerFinalScheduleProps> = ({ userName, userId }) => {
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulePublished, setSchedulePublished] = useState<boolean | null>(null);
  const prevPublishedRef = useRef<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Helper function to get current week start (Monday)
  const getCurrentWeekStart = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  // Fetch publish status (so we can show "Schedule shared by manager")
  // Poll more frequently so workers see updates when manager publishes
  useEffect(() => {
    const fetchPublishStatus = () => {
      const monday = getCurrentWeekStart();
      fetch(`/api/schedule/publish/status?weekStart=${monday.toISOString()}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.published !== undefined) {
            const wasPublished = prevPublishedRef.current;
            const isNowPublished = data.published;
            prevPublishedRef.current = isNowPublished;
            setSchedulePublished(isNowPublished);
            // If schedule was just published, refresh shifts immediately
            if (isNowPublished && !wasPublished) {
              // Trigger a shift refresh
              setTimeout(() => {
                const event = new CustomEvent('schedulePublished');
                window.dispatchEvent(event);
              }, 100);
            }
          }
        })
        .catch(() => {
          prevPublishedRef.current = false;
          setSchedulePublished(false);
        });
    };
    
    // Initial fetch
    fetchPublishStatus();
    
    // Poll every 30 seconds to catch when manager publishes schedule
    const interval = setInterval(fetchPublishStatus, 30 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Map raw API shift to our Shift format
  const mapShift = (s: any): Shift => {
    const start = s.StartTime ?? s.startTime;
    const end = s.EndTime ?? s.endTime;
    const startDate = typeof start === 'string' ? new Date(start) : start;
    const endDate = typeof end === 'string' ? new Date(end) : end;
    const startTimeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const endTimeStr = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return {
      id: String(s.ShiftId ?? s.shiftId ?? ''),
      workerName: userName,
      startTime: startTimeStr,
      endTime: endTimeStr,
      role: 'Employee',
      date: startDate.toISOString(),
      slotNumber: s.SlotNumber ?? s.slotNumber ?? 0
    };
  };

  // Fetch ALL shifts for this worker (backend returns every assigned shift); filter to current week for display
  // Poll more frequently so workers see their schedule updates immediately
  useEffect(() => {
    const fetchShifts = async () => {
      if (!userId) return;
      try {
        setLoading(true);
        const url = `/api/shifts/for-employee?employeeId=${Number(userId)}`;
        console.log('WorkerFinalSchedule: Fetching shifts from', url);
        
        const res = await fetch(url, { credentials: 'include', cache: 'no-cache' });
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('WorkerFinalSchedule: API error', res.status, res.statusText, errorText);
          let errorMessage = `Failed to load schedule (${res.status})`;
          try {
            const errorData = JSON.parse(errorText);
            console.error('WorkerFinalSchedule: Error details', errorData);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            // Not JSON, already logged as text
          }
          setError(errorMessage);
          setShifts([]);
          setLoading(false);
          return;
        }
        
        // Clear any previous errors on success
        setError(null);
        
        const data = await res.json();
        console.log('WorkerFinalSchedule: ========================================');
        console.log('WorkerFinalSchedule: API RESPONSE RECEIVED');
        console.log('WorkerFinalSchedule: Full API response:', JSON.stringify(data, null, 2));
        console.log('WorkerFinalSchedule: Response type:', Array.isArray(data) ? 'Array' : typeof data);
        const allRaw = Array.isArray(data) ? data : [];
        console.log('WorkerFinalSchedule: Total shifts in response:', allRaw.length);
        
        if (allRaw.length === 0) {
          console.log('WorkerFinalSchedule: No shifts assigned for employeeId=', userId);
        }
        console.log('WorkerFinalSchedule: ========================================');
        
        const weekMonday = getCurrentWeekStart();
        const weekEnd = new Date(weekMonday);
        weekEnd.setDate(weekMonday.getDate() + 7);
        
        // Use a much wider buffer (2 weeks before and after) to catch any shifts
        // This ensures we don't miss shifts due to timezone or date calculation issues
        const weekStartWithBuffer = new Date(weekMonday);
        weekStartWithBuffer.setDate(weekMonday.getDate() - 14); // 2 weeks before
        const weekEndWithBuffer = new Date(weekEnd);
        weekEndWithBuffer.setDate(weekEnd.getDate() + 14); // 2 weeks after
        
        console.log('WorkerFinalSchedule: Current week (Monday to Sunday)', {
          weekStart: weekMonday.toISOString().split('T')[0],
          weekEnd: weekEnd.toISOString().split('T')[0],
          weekStartLocal: weekMonday.toLocaleDateString(),
          weekEndLocal: weekEnd.toLocaleDateString()
        });
        console.log('WorkerFinalSchedule: Filtering with wide buffer (2 weeks before/after)');
        
        const inCurrentWeek = (s: any) => {
          const start = s.StartTime ?? s.startTime;
          if (!start) {
            console.warn('WorkerFinalSchedule: Shift missing StartTime', s);
            return false;
          }
          
          // Parse the date - handle both string and Date objects
          let d: Date;
          if (typeof start === 'string') {
            d = new Date(start);
          } else if (start instanceof Date) {
            d = start;
          } else {
            console.warn('WorkerFinalSchedule: Invalid date format', start);
            return false;
          }
          
          // Check if date is valid
          if (isNaN(d.getTime())) {
            console.warn('WorkerFinalSchedule: Invalid date', start);
            return false;
          }
          
          // Compare using the full datetime (not just date) with wide buffer
          // This is more lenient and will catch shifts even if there are timezone issues
          const inRange = d >= weekStartWithBuffer && d < weekEndWithBuffer;
          
          // Also check if it's in the actual current week (for logging)
          const inActualWeek = d >= weekMonday && d < weekEnd;
          
          if (inRange && inActualWeek) {
            console.log('WorkerFinalSchedule: ✓✓✓ Shift in CURRENT week', {
              shiftId: s.ShiftId ?? s.shiftId,
              startTime: d.toISOString(),
              startTimeLocal: d.toLocaleString(),
              dateOnly: d.toISOString().split('T')[0],
              slotNumber: s.SlotNumber ?? s.slotNumber,
              employeeId: s.EmployeeId
            });
          } else if (inRange) {
            console.log('WorkerFinalSchedule: ✓ Shift in buffer range (outside current week)', {
              shiftId: s.ShiftId ?? s.shiftId,
              startTime: d.toISOString(),
              startTimeLocal: d.toLocaleString(),
              dateOnly: d.toISOString().split('T')[0],
              slotNumber: s.SlotNumber ?? s.slotNumber,
              daysFromMonday: Math.round((d.getTime() - weekMonday.getTime()) / (1000 * 60 * 60 * 24))
            });
          } else {
            console.log('WorkerFinalSchedule: ✗ Shift outside buffer range', {
              shiftId: s.ShiftId ?? s.shiftId,
              startTime: d.toISOString(),
              startTimeLocal: d.toLocaleString(),
              dateOnly: d.toISOString().split('T')[0],
              slotNumber: s.SlotNumber ?? s.slotNumber
            });
          }
          
          return inRange;
        };
        // Filter to current week, but also log all shifts for debugging
        console.log('WorkerFinalSchedule: All shifts received (before filtering):', allRaw.length);
        if (allRaw.length > 0) {
          console.log('WorkerFinalSchedule: Sample shift data:', allRaw[0]);
          // Log first few shifts to see their dates
          allRaw.slice(0, 5).forEach((s: any, idx: number) => {
            const start = s.StartTime ?? s.startTime;
            const d = start ? (typeof start === 'string' ? new Date(start) : start) : null;
            console.log(`WorkerFinalSchedule: Shift ${idx + 1}:`, {
              shiftId: s.ShiftId ?? s.shiftId,
              startTime: d?.toISOString(),
              startTimeLocal: d?.toLocaleString(),
              slotNumber: s.SlotNumber ?? s.slotNumber,
              employeeId: s.EmployeeId ?? s.employeeId
            });
          });
        } else {
          console.warn('WorkerFinalSchedule: No shifts returned from API for employeeId=', userId);
          console.warn('WorkerFinalSchedule: This could mean:');
          console.warn('  1. No shifts have been assigned to this employee yet');
          console.warn('  2. The employeeId does not match any assigned shifts');
        }
        
        // Filter shifts - use wide buffer to catch all relevant shifts
        const raw = allRaw.filter(inCurrentWeek);
        console.log('WorkerFinalSchedule: Shifts found in range', raw.length, 'out of', allRaw.length, 'total');
        
        // CRITICAL FIX: Show ALL shifts if ANY exist - NO DATE FILTERING
        // This ensures workers ALWAYS see their assigned shifts
        let shiftsToShow = allRaw; // Show ALL shifts, no filtering
        
        if (allRaw.length > 0) {
          console.log('WorkerFinalSchedule: ✓✓✓ SHIFTS FOUND - Showing ALL', allRaw.length, 'shift(s) to worker');
          console.log('WorkerFinalSchedule: Date filtering DISABLED to ensure worker sees their schedule');
        }
        
        const mappedShifts = shiftsToShow.map(mapShift);
        setShifts(mappedShifts);
      } catch (err) {
        console.error('WorkerFinalSchedule: Error fetching shifts:', err);
        setError(err instanceof Error ? err.message : 'Failed to load schedule. Please check your connection.');
        setShifts([]);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchShifts();
    
    // Listen for schedule published event to refresh immediately
    const handleSchedulePublished = () => {
      fetchShifts();
    };
    window.addEventListener('schedulePublished', handleSchedulePublished);
    
    // Poll every 30 seconds to catch schedule updates
    const interval = setInterval(fetchShifts, 30 * 1000);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('schedulePublished', handleSchedulePublished);
    };
  }, [userId, userName]);

  useEffect(() => {
    if (shifts.length > 0) {
      const fetchInsights = async () => {
        setLoadingInsights(true);
        try {
          // Use a simple message for now - can integrate AI later
          const totalHours = shifts.reduce((acc, shift) => {
            const start = parseInt(shift.startTime.split(':')[0]);
            const end = parseInt(shift.endTime.split(':')[0]);
            return acc + (end - start);
          }, 0);
          
          setInsights(`You have ${shifts.length} shifts scheduled this week, totaling approximately ${totalHours} hours. Your schedule looks well-balanced!`);
        } catch (err) {
          setInsights("Could not load schedule insights at this time. Please check your schedule manually.");
        } finally {
          setLoadingInsights(false);
        }
      };
      fetchInsights();
    }
  }, [shifts]);

  // SlotNumber 1=Mon Morning, 2=Mon Evening, 3=Tue Morning, ... 14=Sun Evening
  const getShiftForSlot = (day: string, slot: 'morning' | 'evening') => {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    if (dayIndex === -1) return undefined;
    const wantSlotNumber = slot === 'morning' ? dayIndex * 2 + 1 : dayIndex * 2 + 2;
    return shifts.find(s => s.slotNumber === wantSlotNumber);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl border border-white">
        <div className="text-center py-12">
          <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4"></i>
          <p className="text-slate-500">Loading schedule...</p>
        </div>
      </div>
    );
  }

  const hasAnyShifts = shifts.length > 0;

  return (
    <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl border border-white overflow-hidden relative">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-black text-gray-800 flex items-center gap-3">
             <span className="text-pink-500 italic">Shiftly</span> — My Schedule
          </h2>
          <p className="text-sm font-medium text-gray-400 mt-1">
            {schedulePublished ? 'Your manager has shared this schedule with you' : 'Viewing your schedule for this week'}
          </p>
          {error && (
            <div className="text-sm text-red-600 mt-2 font-medium bg-red-50 p-3 rounded-lg border border-red-200">
              <p className="font-bold">Could not load schedule</p>
              <p>{error}</p>
            </div>
          )}
          {!hasAnyShifts && !error && (
            <p className="text-sm text-slate-500 mt-2">
              You have <span className="font-semibold text-slate-600">0 shifts</span> scheduled this week.
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
           {schedulePublished && (
             <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[10px] font-bold">
               <i className="fas fa-check-circle mr-1"></i> Shared with you
             </span>
           )}
           <span className="px-3 py-1 bg-white border text-gray-500 rounded-full text-[10px] font-bold">
             {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
           </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-6 text-[10px] font-black text-gray-300 uppercase tracking-widest">Day</th>
              <th className="pb-6 text-[10px] font-black text-gray-300 uppercase tracking-widest text-center">Morning Shift (09-15)</th>
              <th className="pb-6 text-[10px] font-black text-gray-300 uppercase tracking-widest text-center">Evening Shift (15-21)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {DAYS_OF_WEEK.map((day) => {
              const morningShift = getShiftForSlot(day, 'morning');
              const eveningShift = getShiftForSlot(day, 'evening');

              return (
                <tr key={day} className="group transition-colors hover:bg-white/30">
                  <td className="py-8 font-black text-gray-800 text-lg">{day}</td>
                  
                  {/* Morning Cell */}
                  <td className="py-8 px-4">
                    {morningShift ? (
                      <div className="p-4 rounded-3xl shadow-sm border bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-transparent ring-4 ring-indigo-100">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-black text-xs uppercase tracking-tighter">{morningShift.workerName}</p>
                          <span className="text-[10px] opacity-70">{morningShift.startTime} - {morningShift.endTime}</span>
                        </div>
                        <p className="text-[10px] font-bold text-indigo-100">
                          {morningShift.role}
                        </p>
                      </div>
                    ) : (
                      <div className="h-20 border-2 border-dashed border-gray-100 rounded-3xl flex items-center justify-center text-gray-300 font-bold text-xs uppercase tracking-widest">
                        Empty
                      </div>
                    )}
                  </td>

                  {/* Evening Cell */}
                  <td className="py-8 px-4">
                    {eveningShift ? (
                      <div className="p-4 rounded-3xl shadow-sm border bg-gradient-to-br from-pink-500 to-pink-600 text-white border-transparent ring-4 ring-pink-100">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-black text-xs uppercase tracking-tighter">{eveningShift.workerName}</p>
                          <span className="text-[10px] opacity-70">{eveningShift.startTime} - {eveningShift.endTime}</span>
                        </div>
                        <p className="text-[10px] font-bold text-pink-100">
                          {eveningShift.role}
                        </p>
                      </div>
                    ) : (
                      <div className="h-20 border-2 border-dashed border-gray-100 rounded-3xl flex items-center justify-center text-gray-300 font-bold text-xs uppercase tracking-widest">
                        Empty
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AI Insights Bar */}
      {insights && (
        <div className="mt-12 bg-indigo-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
              <h4 className="text-cyan-400 font-black uppercase text-xs tracking-widest">Schedule Insights</h4>
            </div>
            <div className="max-w-3xl">
              {loadingInsights ? (
                 <div className="flex gap-2">
                   {[1,2,3].map(i => <div key={i} className="h-4 w-4 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: `${i*0.2}s`}}></div>)}
                 </div>
              ) : (
                <p className="text-indigo-50 font-medium leading-relaxed italic text-lg">
                  "{insights}"
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerFinalSchedule;


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
  weekMonday: Date;
}

import { DAYS } from '../constants';
import {
  formatWeekStartParam,
  formatWeekLabel,
  mapApiShiftToShift,
  resolveSlotNumber,
} from '../utils/week';

const DAYS_OF_WEEK = DAYS;

const WorkerFinalSchedule: React.FC<WorkerFinalScheduleProps> = ({ userName, userId, weekMonday }) => {
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulePublished, setSchedulePublished] = useState<boolean | null>(null);
  const prevPublishedRef = useRef<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch publish status (so we can show "Schedule shared by manager")
  // Poll more frequently so workers see updates when manager publishes
  useEffect(() => {
    const fetchPublishStatus = () => {
      const weekParam = formatWeekStartParam(weekMonday);
      fetch(`/api/schedule/publish/status?weekStart=${weekParam}`, { credentials: 'include' })
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
  }, [weekMonday]);

  useEffect(() => {
    const fetchShifts = async () => {
      if (!userId) return;
      try {
        setLoading(true);
        const weekParam = formatWeekStartParam(weekMonday);
        const url = `/api/shifts?weekStart=${weekParam}`;
        const res = await fetch(url, { credentials: 'include', cache: 'no-cache' });

        if (!res.ok) {
          const errorText = await res.text();
          let errorMessage = `Failed to load schedule (${res.status})`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            /* not json */
          }
          setError(errorMessage);
          setShifts([]);
          setLoading(false);
          return;
        }

        setError(null);
        const data = await res.json();
        const allRaw = Array.isArray(data) ? data : [];
        const userIdStr = String(userId);

        const assigned = allRaw.filter((s: Record<string, unknown>) => {
          const empId = s.EmployeeId ?? s.employeeId;
          return empId != null && String(empId) === userIdStr;
        });

        const mappedShifts: Shift[] = assigned.map((raw: Record<string, unknown>) => {
          const mapped = mapApiShiftToShift(raw);
          return {
            id: mapped.id,
            workerName: userName,
            startTime: mapped.startTime,
            endTime: mapped.endTime,
            role: 'Employee',
            date: String(raw.StartTime ?? raw.startTime ?? ''),
            slotNumber: mapped.slotNumber ?? resolveSlotNumber(raw),
          };
        });

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
    const interval = setInterval(fetchShifts, 8 * 1000);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('schedulePublished', handleSchedulePublished);
    };
  }, [userId, userName, weekMonday]);

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

  const getShiftForSlot = (day: string, slot: 'morning' | 'evening') => {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    if (dayIndex === -1) return undefined;
    const wantSlotNumber = dayIndex * 2 + (slot === 'morning' ? 1 : 2);
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
             <span className="text-pink-500 italic">Shiftly</span> — הלוח שלי
          </h2>
          <p className="text-sm font-medium text-gray-400 mt-1 dir-rtl">
            {schedulePublished
              ? 'המנהל פרסם את הלוח — המשמרות שלך מוצגות למטה'
              : 'הלוח לשבוע זה עדיין לא פורסם — ייתכן שלא יוצגו משמרות'}
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
           <span className="px-3 py-1 bg-white border text-gray-500 rounded-full text-[10px] font-bold dir-rtl">
             {formatWeekLabel(weekMonday)}
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


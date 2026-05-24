/**
 * EmployeeSidebar.tsx — שורת סגל עובדים (למנהל)
 * חיפוש, סינון, מיון + גרירה למשמרות
 */
import React, { useMemo, useState } from 'react';
import { Employee } from '../types';
import { normalizeProductivityScore } from '../utils/throughput';
import { DAY_SHORT_HE, formatRoleHe } from '../utils/labelsHe';
import { MAX_SHIFTS_PER_EMPLOYEE_WEEK } from '../constants';

interface EmployeeSidebarProps {
  employees: Employee[];
  onDragStart: (e: React.DragEvent, employeeId: string) => void;
  employeeAvailabilityCount?: Map<string, number>;
  employeeAvailabilityMap?: Map<string, Record<string, boolean>>;
  employeeAssignmentCount?: Map<string, number>;
  loading?: boolean;
}

type AvailabilityFilter = 'all' | 'with' | 'without';
type SortMode = 'availability' | 'productivity' | 'name';

const EmployeeSidebar: React.FC<EmployeeSidebarProps> = ({
  employees,
  onDragStart,
  employeeAvailabilityCount,
  employeeAvailabilityMap,
  employeeAssignmentCount,
  loading = false,
}) => {
  const [search, setSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('availability');

  const getAvailabilityCount = (empId: string): number =>
    employeeAvailabilityCount?.get(empId) ?? 0;

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = employees.filter((emp) => {
      if (q) {
        const haystack = `${emp.name} ${emp.role}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const count = getAvailabilityCount(emp.id);
      if (availabilityFilter === 'with' && count <= 0) return false;
      if (availabilityFilter === 'without' && count > 0) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'name') {
        return a.name.localeCompare(b.name, 'he');
      }
      if (sortMode === 'productivity') {
        return normalizeProductivityScore(b.productivityScore) - normalizeProductivityScore(a.productivityScore);
      }
      return getAvailabilityCount(b.id) - getAvailabilityCount(a.id);
    });

    return list;
  }, [employees, search, availabilityFilter, sortMode, employeeAvailabilityCount]);

  const hasActiveControls =
    search.trim() !== '' || availabilityFilter !== 'all' || sortMode !== 'availability';

  const resetControls = () => {
    setSearch('');
    setAvailabilityFilter('all');
    setSortMode('availability');
  };

  const renderAvailabilityBadges = (emp: Employee) => {
    if (!employeeAvailabilityMap) return null;
    const availabilityMap = employeeAvailabilityMap.get(emp.id) || {};
    const availableShifts: Array<{ dayAbbrev: string; shortLabel: string; day: string; time: string }> = [];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let slot = 1; slot <= 14; slot++) {
      const slotKey = String(slot);
      const isAvailable = availabilityMap[slotKey] === true || availabilityMap[slot] === true;
      if (!isAvailable) continue;
      const dayIndex = Math.floor((slot - 1) / 2);
      const isMorning = (slot - 1) % 2 === 0;
      availableShifts.push({
        day: dayNames[dayIndex] || '',
        time: isMorning ? 'Morning (09-15)' : 'Afternoon (15-21)',
        dayAbbrev: DAY_SHORT_HE[dayAbbrevs[dayIndex]] || dayAbbrevs[dayIndex] || '',
        shortLabel: isMorning ? 'ב׳' : 'ע׳',
      });
    }

    if (availableShifts.length === 0) {
      return (
        <div className="mt-3 pt-3 border-t border-rose-200/50">
          <p className="text-[9px] text-slate-400 italic flex items-center">
            <i className="fas fa-info-circle mr-1"></i>
            לא הוגדרה זמינות — העובד/ת מעדכן/ת בפורטל
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2 pt-2 border-t border-rose-100">
        <p className="text-[9px] font-bold text-slate-500 mb-1 dir-rtl">
          זמינות ({availableShifts.length})
        </p>
        <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
          {availableShifts.map((shift, idx) => (
            <span
              key={idx}
              className="px-1 py-0.5 rounded text-[8px] font-semibold bg-green-50 text-green-700 border border-green-200"
              title={`${shift.day} ${shift.time}`}
            >
              {shift.dayAbbrev} {shift.shortLabel}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
      <div className="bg-white/95 rounded-2xl shadow-md border border-rose-200/60 p-3 lg:sticky lg:top-20 flex flex-col max-h-[calc(100vh-5.5rem)]">
        <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center justify-between flex-shrink-0 dir-rtl">
          <span className="flex items-center">
            <i className="fas fa-users-rectangle mr-3 text-rose-500"></i>
            סגל עובדים
          </span>
          {!loading && employees.length > 0 && (
            <span className="text-sm font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">
              {employees.length}
            </span>
          )}
        </h3>

        {!loading && employees.length > 0 && (
          <div className="mb-2 space-y-2 flex-shrink-0 border-b border-rose-100 pb-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם או תפקיד..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-rose-200 bg-white/90 focus:outline-none focus:ring-2 focus:ring-rose-400 dir-rtl text-right"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider col-span-2">
                סינון
              </label>
              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value as AvailabilityFilter)}
                className="col-span-2 px-3 py-2 text-sm rounded-xl border border-rose-200 bg-white/90 focus:outline-none focus:ring-2 focus:ring-rose-400 dir-rtl text-right"
              >
                <option value="all">הכל</option>
                <option value="with">עם זמינות</option>
                <option value="without">ללא זמינות</option>
              </select>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider col-span-2 mt-1">
                מיון
              </label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="col-span-2 px-3 py-2 text-sm rounded-xl border border-rose-200 bg-white/90 focus:outline-none focus:ring-2 focus:ring-rose-400 dir-rtl text-right"
              >
                <option value="availability">זמינות (גבוה ראשון)</option>
                <option value="productivity">יעילות (גבוה ראשון)</option>
                <option value="name">שם (א–ת)</option>
              </select>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium dir-rtl">
                מציג {filteredEmployees.length} מתוך {employees.length}
              </span>
              {hasActiveControls && (
                <button
                  type="button"
                  onClick={resetControls}
                  className="text-rose-600 hover:text-rose-700 font-bold dir-rtl"
                >
                  איפוס
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <i className="fas fa-spinner fa-spin text-rose-500 text-2xl mb-2"></i>
            <p className="text-slate-600 font-bold">טוען עובדים...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-users-slash text-slate-400 text-2xl mb-2"></i>
            <p className="text-slate-600 font-bold">אין עובדים</p>
            <p className="text-slate-500 text-sm mt-1">עובדים יופיעו כאן לאחר הוספתם</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-12 flex-1">
            <i className="fas fa-filter text-slate-400 text-2xl mb-2"></i>
            <p className="text-slate-600 font-bold dir-rtl">אין עובדים התואמים לסינון</p>
            <button
              type="button"
              onClick={resetControls}
              className="mt-3 text-sm text-rose-600 font-bold hover:underline dir-rtl"
            >
              איפוס סינון
            </button>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-0.5">
            {filteredEmployees.map((emp) => {
              const normalized = normalizeProductivityScore(emp.productivityScore);
              const scoreColor =
                normalized >= 8.5
                  ? 'bg-green-500'
                  : normalized >= 7
                    ? 'bg-orange-500'
                    : 'bg-red-500';
              const availCount = getAvailabilityCount(emp.id);
              const assignedCount = employeeAssignmentCount?.get(emp.id) ?? 0;
              const atWeeklyLimit = assignedCount >= MAX_SHIFTS_PER_EMPLOYEE_WEEK;

              return (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, emp.id)}
                  className="group p-2.5 rounded-lg border border-rose-100 bg-white hover:border-rose-200 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      <img
                        src={emp.avatar}
                        alt={emp.name}
                        className="w-9 h-9 rounded-full bg-slate-200 border border-white"
                      />
                      <div
                        className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${scoreColor}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{emp.name}</p>
                      <p className="text-[9px] text-slate-500">{formatRoleHe(emp.role)} · {emp.hourlyRate}₪/שעה</p>
                    </div>
                    <div className="text-left shrink-0">
                      <span className="text-sm font-black text-slate-800">{normalized.toFixed(1)}</span>
                      <span className="text-[8px] text-slate-500 block">/10</span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                      {employeeAvailabilityCount && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            availCount > 0
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {availCount} זמין
                        </span>
                      )}
                      {employeeAssignmentCount && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            atWeeklyLimit
                              ? 'bg-red-100 text-red-700'
                              : assignedCount > 0
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                          title={`מקסימום ${MAX_SHIFTS_PER_EMPLOYEE_WEEK} משמרות בשבוע`}
                        >
                          {assignedCount}/{MAX_SHIFTS_PER_EMPLOYEE_WEEK} שובץ
                        </span>
                      )}
                    {renderAvailabilityBadges(emp)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-2 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[10px] leading-snug text-slate-600 flex-shrink-0 dir-rtl text-right">
          <i className="fas fa-lightbulb text-amber-500 text-[9px] ml-1" />
          גרור עובדים עם זמינות למשמרת. מקסימום {MAX_SHIFTS_PER_EMPLOYEE_WEEK} משמרות שובצות לעובד/ת בשבוע.
        </p>
      </div>
    </div>
  );
};

export default EmployeeSidebar;

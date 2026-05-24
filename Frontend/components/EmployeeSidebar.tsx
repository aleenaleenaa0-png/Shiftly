/**
 * EmployeeSidebar.tsx — שורת סגל עובדים (למנהל)
 * חיפוש, סינון, מיון + גרירה למשמרות
 */
import React, { useMemo, useState } from 'react';
import { Employee } from '../types';
import { normalizeProductivityScore } from '../utils/throughput';

interface EmployeeSidebarProps {
  employees: Employee[];
  onDragStart: (e: React.DragEvent, employeeId: string) => void;
  employeeAvailabilityCount?: Map<string, number>;
  employeeAvailabilityMap?: Map<string, Record<string, boolean>>;
  loading?: boolean;
}

type AvailabilityFilter = 'all' | 'with' | 'without';
type SortMode = 'availability' | 'productivity' | 'name';

const EmployeeSidebar: React.FC<EmployeeSidebarProps> = ({
  employees,
  onDragStart,
  employeeAvailabilityCount,
  employeeAvailabilityMap,
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
        dayAbbrev: dayAbbrevs[dayIndex] || '',
        shortLabel: isMorning ? 'AM' : 'PM',
      });
    }

    if (availableShifts.length === 0) {
      return (
        <div className="mt-3 pt-3 border-t border-rose-200/50">
          <p className="text-[9px] text-slate-400 italic flex items-center">
            <i className="fas fa-info-circle mr-1"></i>
            No availability set - worker needs to set availability first
          </p>
        </div>
      );
    }

    return (
      <div className="mt-3 pt-3 border-t border-rose-200/50">
        <div className="flex items-center mb-2">
          <i className="fas fa-calendar-check text-green-500 text-[10px] mr-1.5"></i>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
            Available Shifts ({availableShifts.length}):
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableShifts.map((shift, idx) => (
            <span
              key={idx}
              className="px-2 py-1 rounded-md text-[9px] font-bold bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border border-green-300 shadow-sm"
              title={`Available for ${shift.day} ${shift.time}`}
            >
              <span className="font-black">{shift.dayAbbrev}</span>{' '}
              <span className="text-green-600">{shift.shortLabel}</span>
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full lg:w-[26rem] flex-shrink-0">
      <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl shadow-rose-500/10 border border-rose-200/50 p-5 lg:sticky lg:top-24 flex flex-col lg:max-h-[calc(100vh-7rem)]">
        <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center justify-between tracking-tight flex-shrink-0">
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
            <p className="text-slate-600 font-bold">Loading employees...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-users-slash text-slate-400 text-2xl mb-2"></i>
            <p className="text-slate-600 font-bold">No employees found</p>
            <p className="text-slate-500 text-sm mt-1">Employees will appear here once they are added</p>
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
          <div className="space-y-3 overflow-y-auto flex-1 min-h-[min(60vh,28rem)] pr-1 -mr-1">
            {filteredEmployees.map((emp) => {
              const normalized = normalizeProductivityScore(emp.productivityScore);
              const scoreColor =
                normalized >= 8.5
                  ? 'bg-green-500'
                  : normalized >= 7
                    ? 'bg-orange-500'
                    : 'bg-red-500';
              const availCount = getAvailabilityCount(emp.id);

              return (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, emp.id)}
                  className="group p-4 rounded-xl border border-rose-200 bg-white/60 backdrop-blur-sm hover:border-rose-300 hover:bg-white hover:shadow-lg hover:shadow-rose-500/15 transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center">
                    <div className="relative">
                      <img
                        src={emp.avatar}
                        alt={emp.name}
                        className="w-12 h-12 rounded-full bg-slate-200 border-2 border-white shadow-sm"
                      />
                      <div
                        className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${scoreColor}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0 ml-4">
                      <p className="text-sm font-black text-slate-800 truncate">{emp.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {emp.role}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-slate-800 leading-none">
                        {normalized.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">/ 10 יעילות</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-rose-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center text-[11px] font-bold text-slate-500">
                        <i className="fas fa-dollar-sign mr-1"></i>
                        <span>{emp.hourlyRate}/שעה</span>
                      </div>
                      {employeeAvailabilityCount && (
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
                            availCount > 0
                              ? 'bg-green-100 text-green-700 border border-green-300 shadow-sm'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                          title={`Available for ${availCount} shift(s)`}
                        >
                          <i
                            className={`fas ${availCount > 0 ? 'fa-check-circle' : 'fa-calendar-times'} mr-1`}
                          />
                          {availCount} shifts
                        </span>
                      )}
                    </div>
                    {renderAvailabilityBadges(emp)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-2 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[10px] leading-snug text-slate-600 flex-shrink-0 dir-rtl text-right">
          <i className="fas fa-lightbulb text-amber-500 text-[9px] ml-1" />
          גרור עובדים עם זמינות למשמרת — זמינות נקבעת בפורטל העובד.
        </p>
      </div>
    </div>
  );
};

export default EmployeeSidebar;

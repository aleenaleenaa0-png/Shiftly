/**
 * EmployeeSidebar.tsx — شريط العمال (للمدير)
 * يعرض عدد المناوبات المتاحة لكل عامل + شارات Mon AM, Tue PM, ...
 * للمختبر: بعد أن يحدّد العامل توفره، يجب تحديث هذه القائمة خلال 5 ثوانٍ.
 */
import React from 'react';
import { Employee } from '../types';

interface EmployeeSidebarProps {
  employees: Employee[];
  onDragStart: (e: React.DragEvent, employeeId: string) => void;
  employeeAvailabilityCount?: Map<string, number>;
  employeeAvailabilityMap?: Map<string, Record<string, boolean>>; // employeeId -> availabilityMap (slot 1-14 -> boolean)
  loading?: boolean;
}

const EmployeeSidebar: React.FC<EmployeeSidebarProps> = ({ employees, onDragStart, employeeAvailabilityCount, employeeAvailabilityMap, loading = false }) => {
  return (
    <div className="w-full lg:w-96 flex-shrink-0">
      <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl shadow-rose-500/10 border border-rose-200/50 p-8 sticky top-24">
        <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center justify-between tracking-tight">
          <span className="flex items-center">
          <i className="fas fa-users-rectangle mr-3 text-rose-500"></i>
          סגל עובדים
          </span>
          {!loading && employees.length > 0 && (
            <span className="text-sm font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">
              {employees.length} employees
            </span>
          )}
        </h3>
        
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
        ) : (
        <div className="space-y-4">
          {employees.map((emp) => {
             const scoreColor = emp.productivityScore > 85 ? 'bg-green-500' : 
                               emp.productivityScore > 70 ? 'bg-orange-500' : 'bg-red-500';

             return (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, emp.id)}
                  className="group p-5 rounded-2xl border border-rose-200 bg-white/60 backdrop-blur-sm hover:border-rose-300 hover:bg-white hover:shadow-xl hover:shadow-rose-500/20 transition-all cursor-grab active:cursor-grabbing hover:-translate-y-1 transform hover:scale-105"
                >
                  <div className="flex items-center">
                    <div className="relative">
                        <img 
                            src={emp.avatar} 
                            alt={emp.name} 
                            className="w-12 h-12 rounded-full bg-slate-200 border-2 border-white shadow-sm" 
                        />
                        <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${scoreColor}`}></div>
                    </div>
                    <div className="flex-1 min-w-0 ml-4">
                      <p className="text-sm font-black text-slate-800 truncate">{emp.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{emp.role}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-slate-800 leading-none">{emp.productivityScore}%</div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">יעילות</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-rose-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center text-[11px] font-bold text-slate-500">
                          <i className="fas fa-dollar-sign mr-1"></i>
                          <span>{emp.hourlyRate}/שעה</span>
                      </div>
                      <div className="flex items-center space-x-2">
                          {employeeAvailabilityCount && employeeAvailabilityCount.get(emp.id) !== undefined && (
                              <span 
                                  className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
                                      (employeeAvailabilityCount.get(emp.id) || 0) > 0
                                          ? 'bg-green-100 text-green-700 border border-green-300 shadow-sm'
                                          : 'bg-slate-100 text-slate-500'
                                  }`}
                                  title={`Available for ${employeeAvailabilityCount.get(emp.id) || 0} shift(s)`}
                              >
                                  <i className={`fas ${(employeeAvailabilityCount.get(emp.id) || 0) > 0 ? 'fa-check-circle' : 'fa-calendar-times'} mr-1`}></i>
                                  {employeeAvailabilityCount.get(emp.id) || 0} shifts
                              </span>
                          )}
                      </div>
                    </div>
                    {/* Display specific available shifts */}
                    {employeeAvailabilityMap && (() => {
                      const availabilityMap = employeeAvailabilityMap.get(emp.id) || {};
                      console.log(`EmployeeSidebar: Rendering availability for ${emp.name} (ID: ${emp.id})`);
                      console.log(`EmployeeSidebar: Availability map:`, availabilityMap);
                      console.log(`EmployeeSidebar: Map has entry:`, employeeAvailabilityMap.has(emp.id));
                      
                      const availableShifts: Array<{day: string, time: string, dayAbbrev: string, shortLabel: string}> = [];
                      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                      const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                      
                      // Slot mapping: 1=Mon AM, 2=Mon PM, 3=Tue AM, 4=Tue PM, ..., 14=Sun PM
                      for (let slot = 1; slot <= 14; slot++) {
                        const slotKey = String(slot);
                        // Also check numeric key in case it's stored as number
                        const isAvailable = availabilityMap[slotKey] === true || availabilityMap[slot] === true;
                        
                        if (isAvailable) {
                          const dayIndex = Math.floor((slot - 1) / 2);
                          const isMorning = (slot - 1) % 2 === 0;
                          const dayName = dayNames[dayIndex] || '';
                          const dayAbbrev = dayAbbrevs[dayIndex] || '';
                          const timeLabel = isMorning ? 'Morning (09-15)' : 'Afternoon (15-21)';
                          const shortLabel = isMorning ? 'AM' : 'PM';
                          availableShifts.push({
                            day: dayName,
                            time: timeLabel,
                            dayAbbrev: dayAbbrev,
                            shortLabel: shortLabel
                          });
                        }
                      }
                      
                      console.log(`EmployeeSidebar: ${emp.name} - Found ${availableShifts.length} available shifts`);
                      
                      return availableShifts.length > 0 ? (
                        <div className="mt-3 pt-3 border-t border-rose-200/50">
                          <div className="flex items-center mb-2">
                            <i className="fas fa-calendar-check text-green-500 text-[10px] mr-1.5"></i>
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Available Shifts ({availableShifts.length}):</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {availableShifts.map((shift, idx) => (
                              <span 
                                key={idx}
                                className="px-2 py-1 rounded-md text-[9px] font-bold bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border border-green-300 shadow-sm hover:shadow-md transition-shadow"
                                title={`Available for ${shift.day} ${shift.time}`}
                              >
                                <span className="font-black">{shift.dayAbbrev}</span> <span className="text-green-600">{shift.shortLabel}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 pt-3 border-t border-rose-200/50">
                          <p className="text-[9px] text-slate-400 italic flex items-center">
                            <i className="fas fa-info-circle mr-1"></i>
                            No availability set - worker needs to set availability first
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
             );
          })}
        </div>
        )}

        <div className="mt-10 p-6 bg-gradient-to-br from-rose-500 via-purple-500 to-cyan-500 rounded-3xl text-white shadow-xl shadow-rose-500/30">
          <div className="flex items-center mb-3">
            <i className="fas fa-lightbulb text-yellow-200 mr-2"></i>
            <p className="text-[11px] font-black uppercase tracking-widest text-white/90">Manager tip</p>
          </div>
          <p className="text-sm leading-relaxed font-medium text-white">
            Drag employees onto a shift only if they have set availability for that shift (see &quot;X shifts&quot; badge). Employees set availability in the Worker Portal; then you can assign them here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSidebar;

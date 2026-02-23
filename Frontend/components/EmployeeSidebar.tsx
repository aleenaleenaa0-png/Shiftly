
import React from 'react';
import { Employee } from '../types';

interface EmployeeSidebarProps {
  employees: Employee[];
  onDragStart: (e: React.DragEvent, employeeId: string) => void;
  employeeAvailabilityCount?: Map<string, number>;
}

const EmployeeSidebar: React.FC<EmployeeSidebarProps> = ({ employees, onDragStart, employeeAvailabilityCount }) => {
  return (
    <div className="w-full lg:w-96 flex-shrink-0">
      <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl shadow-rose-500/10 border border-rose-200/50 p-8 sticky top-24">
        <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center tracking-tight">
          <i className="fas fa-users-rectangle mr-3 text-rose-500"></i>
          סגל עובדים
        </h3>
        
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
                  <div className="mt-4 pt-4 border-t border-rose-200 flex items-center justify-between">
                    <div className="flex items-center text-[11px] font-bold text-slate-500">
                        <i className="fas fa-dollar-sign mr-1"></i>
                        <span>{emp.hourlyRate}/שעה</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        {employeeAvailabilityCount && employeeAvailabilityCount.get(emp.id) !== undefined && (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                (employeeAvailabilityCount.get(emp.id) || 0) > 0
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-slate-100 text-slate-500'
                            }`}>
                                <i className="fas fa-calendar-check mr-1"></i>
                                {employeeAvailabilityCount.get(emp.id) || 0}
                            </span>
                        )}
                        <div className="flex -space-x-1">
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                                <div key={i} className="w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black border border-rose-200 bg-rose-50 text-slate-400">
                                    {day}
                                </div>
                            ))}
                        </div>
                    </div>
                  </div>
                </div>
             );
          })}
        </div>

        <div className="mt-10 p-6 bg-gradient-to-br from-rose-500 via-purple-500 to-cyan-500 rounded-3xl text-white shadow-xl shadow-rose-500/30">
          <div className="flex items-center mb-3">
            <i className="fas fa-lightbulb text-yellow-200 mr-2"></i>
            <p className="text-[11px] font-black uppercase tracking-widest text-white/90">טיפ למנהל</p>
          </div>
          <p className="text-sm leading-relaxed font-medium text-white">
            שבץ את העובדים עם ציון היעילות הגבוה ביותר למשמרות הערב, שם פוטנציאל המכירות הוא הגבוה ביותר.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSidebar;

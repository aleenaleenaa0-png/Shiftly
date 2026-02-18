
import React, { useState, useEffect } from 'react';
import { Shift, Employee, ScheduleKPIs } from './types';
import { EMPLOYEES, INITIAL_SHIFTS, DAYS } from './constants';
import KPIBanner from './components/KPIBanner';
import EmployeeSidebar from './components/EmployeeSidebar';
import EmployeeManagement from './components/EmployeeManagement';
import EmployeeAvailability from './components/EmployeeAvailability';
import Login from './components/Login';
import SignUp from './components/SignUp';
import { getScheduleOptimizationInsights, getSmartSuggestion, autoGenerateSchedule } from './geminiService';

type Page = 'schedule' | 'employees' | 'availability';

interface User {
  userId: number;
  fullName: string;
  email: string;
  storeId: number;
  storeName?: string;
  role?: string; // "Manager" or "Employee"
  userType?: string; // "Manager" or "Employee"
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('schedule');
  
  // Function to safely set page - prevents employees from accessing manager pages
  const setPage = (page: Page) => {
    // Only enforce restrictions if user is logged in
    if (!user) {
      setCurrentPage(page);
      return;
    }
    
    const isEmployee = user.role === 'Employee' || user.userType === 'Employee';
    const isManager = user.role === 'Manager' || user.userType === 'Manager';
    
    // Employees can only access availability page
    if (isEmployee && page !== 'availability') {
      setCurrentPage('availability');
      return;
    }
    
    // Managers can access schedule and employees pages, but not availability
    if (isManager && page === 'availability') {
      setCurrentPage('schedule');
      return;
    }
    
    setCurrentPage(page);
  };
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true); // Start with true to show loading, then login
  const [authPage, setAuthPage] = useState<'login' | 'signup'>('login');
  const [shifts, setShifts] = useState<Shift[]>(INITIAL_SHIFTS);
  const [employees] = useState<Employee[]>(EMPLOYEES);
  const [kpis, setKpis] = useState<ScheduleKPIs>({
    totalCost: 0,
    totalTargetSales: 0,
    efficiencyRatio: 0,
    coveragePercentage: 0
  });
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let totalCost = 0;
    let totalTargetSales = 0;
    let filledShifts = 0;

    shifts.forEach(shift => {
      totalTargetSales += shift.targetSales;
      if (shift.assignedEmployeeId) {
        filledShifts++;
        const employee = employees.find(e => e.id === shift.assignedEmployeeId);
        if (employee) {
          totalCost += employee.hourlyRate * 6; // Assume 6h shift
        }
      }
    });

    setKpis({
      totalCost,
      totalTargetSales,
      efficiencyRatio: totalCost > 0 ? totalTargetSales / totalCost : 0,
      coveragePercentage: Math.round((filledShifts / shifts.length) * 100)
    });
  }, [shifts, employees]);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/account/me', {
          credentials: 'include'
        });
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          // If employee, redirect to availability page
          if (userData.role === 'Employee' || userData.userType === 'Employee') {
            setCurrentPage('availability');
          }
        } else {
          // Not authenticated - ensure user is null
          setUser(null);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        // On error, assume not authenticated
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Check connection to ASP.NET backend (/api/status)
  useEffect(() => {
    const checkBackend = async () => {
      try {
        setBackendError(null);
        const res = await fetch('/api/status');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json() as any;
        if (data.message) {
          setBackendStatus(data.message);
        } else {
          setBackendStatus(
            `Connected (Stores: ${data.stores ?? 0}, Employees: ${data.employees ?? 0}, Shifts: ${data.shifts ?? 0})`
          );
        }
      } catch (err: any) {
        setBackendError(err.message ?? 'Failed to reach backend');
      }
    };

    checkBackend();
  }, []);

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    // If employee, redirect to availability page; managers go to schedule
    if (userData.role === 'Employee' || userData.userType === 'Employee') {
      setCurrentPage('availability');
    } else {
      setCurrentPage('schedule');
    }
  };
  
  // Ensure employees can only see availability page - redirect if they try to access other pages
  useEffect(() => {
    if (user) {
      const isEmployee = user.role === 'Employee' || user.userType === 'Employee';
      if (isEmployee && currentPage !== 'availability') {
        setCurrentPage('availability');
      }
    }
  }, [user, currentPage]);

  const handleLogout = async () => {
    try {
      await fetch('/api/account/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      // Still clear user even if request fails
      setUser(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, employeeId: string) => {
    e.dataTransfer.setData('employeeId', employeeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, shiftId: string) => {
    e.preventDefault();
    const employeeId = e.dataTransfer.getData('employeeId');
    if (employeeId) {
      setShifts(prev => prev.map(s => 
          s.id === shiftId ? { ...s, assignedEmployeeId: employeeId } : s
      ));
    }
  };

  // Fast local auto-schedule algorithm (no API calls)
  const fastAutoSchedule = (shiftsToFill: Shift[], availableEmployees: Employee[]) => {
    // Track how many shifts each employee has been assigned
    const employeeShiftCount: Record<string, number> = {};
    availableEmployees.forEach(emp => {
      employeeShiftCount[emp.id] = 0;
    });

    // Sort shifts by target sales (highest first) - prioritize high-value shifts
    const sortedShifts = [...shiftsToFill]
      .filter(s => !s.assignedEmployeeId) // Only unassigned shifts
      .sort((a, b) => b.targetSales - a.targetSales);

    const assignments: { shiftId: string; employeeId: string }[] = [];

    // For each shift, find the best employee
    sortedShifts.forEach(shift => {
      // Filter employees by availability
      const availableForShift = availableEmployees.filter(emp => {
        // Check if employee is available on this day
        const isAvailable = emp.availability.includes(shift.day);
        return isAvailable;
      });

      if (availableForShift.length === 0) {
        // No available employees, skip this shift
        return;
      }

      // Calculate match score for each employee
      // Score = (productivity * targetSales) / (hourlyRate * shiftCount + 1)
      // Higher productivity + higher target = better match
      // Lower hourly rate = better cost efficiency
      // Lower shift count = better workload balance
      const scoredEmployees = availableForShift.map(emp => {
        const productivityMatch = emp.productivityScore * shift.targetSales;
        const costEfficiency = emp.hourlyRate * (employeeShiftCount[emp.id] + 1);
        const matchScore = productivityMatch / costEfficiency;
        
        return {
          employee: emp,
          score: matchScore,
          shiftCount: employeeShiftCount[emp.id]
        };
      });

      // Sort by match score (highest first), then by shift count (lowest first) for balance
      scoredEmployees.sort((a, b) => {
        if (Math.abs(a.score - b.score) < 0.01) {
          // If scores are very close, prefer employee with fewer shifts
          return a.shiftCount - b.shiftCount;
        }
        return b.score - a.score;
      });

      // Assign the best match
      const bestMatch = scoredEmployees[0];
      if (bestMatch) {
        assignments.push({
          shiftId: shift.id,
          employeeId: bestMatch.employee.id
        });
        employeeShiftCount[bestMatch.employee.id]++;
      }
    });

    return assignments;
  };

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    
    // Use fast local algorithm instead of AI API
    // This runs instantly without network calls
    try {
      const assignments = fastAutoSchedule(shifts, employees);
      
      if (assignments.length > 0) {
        setShifts(prev => prev.map(s => {
          const assignment = assignments.find(a => a.shiftId === s.id);
          return assignment ? { ...s, assignedEmployeeId: assignment.employeeId } : s;
        }));
      } else {
        // No assignments made - might be no available employees
        alert("לא נמצאו עובדים זמינים לשיבוץ. אנא ודא שיש עובדים עם זמינות מתאימה.");
      }
    } catch (error) {
      console.error('Auto schedule error:', error);
      alert("שגיאה ביצירת סידור עבודה אוטומטי.");
    } finally {
      setIsAutoFilling(false);
    }
  };

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await getScheduleOptimizationInsights(shifts, employees);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const requestSmartSuggestion = async (shift: Shift) => {
    setSuggestionLoading(shift.id);
    const result = await getSmartSuggestion(shift, employees);
    if (result && result.includes('|')) {
        const [empId, reason] = result.split('|').map(s => s.trim());
        if (employees.find(e => e.id === empId)) {
            setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, assignedEmployeeId: empId } : s));
            // Show suggestion as a small toast or inline instead of alert in a real app, but alert works for demo
            console.log(`AI Suggestion for ${shift.day}: ${reason}`);
        }
    }
    setSuggestionLoading(null);
  };

  const removeAssignment = (shiftId: string) => {
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, assignedEmployeeId: null } : s));
  };

  // Show login page if not authenticated
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4"></i>
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authPage === 'signup') {
      return (
        <SignUp
          onSignUpSuccess={() => setAuthPage('login')}
          onSwitchToLogin={() => setAuthPage('login')}
        />
      );
    }
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        onSwitchToSignUp={() => setAuthPage('signup')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-3 rounded-xl shadow-lg shadow-purple-200/50 transform hover:scale-105 transition-transform duration-200">
                <div className="flex items-center justify-center">
                  <i className="fas fa-calendar-check text-white text-xl"></i>
                  <i className="fas fa-clock text-white text-xs absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1 shadow-md"></i>
                </div>
              </div>
              <div className="absolute -inset-1 bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 rounded-xl blur opacity-30 animate-pulse"></div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent tracking-tight">
                Shiftly
              </h1>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Smart Scheduling</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center space-x-2">
            {/* Only show Schedule for managers */}
            {(user.role === 'Manager' || user.userType === 'Manager') && (
              <button
                onClick={() => setPage('schedule')}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  currentPage === 'schedule'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <i className="fas fa-calendar-alt mr-2"></i>
                Schedule
              </button>
            )}
            
            {/* Only show manager pages for managers */}
            {(user.role === 'Manager' || user.userType === 'Manager') && (
              <button
                onClick={() => setPage('employees')}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  currentPage === 'employees'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <i className="fas fa-users mr-2"></i>
                Employees
              </button>
            )}
            
            {/* Only show availability page for employees */}
            {(user.role === 'Employee' || user.userType === 'Employee') && (
              <button
                onClick={() => setPage('availability')}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  currentPage === 'availability'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <i className="fas fa-calendar-check mr-2"></i>
                My Availability
              </button>
            )}
          </nav>

          <div className="flex items-center space-x-3">
            {backendError && (
              <span className="text-xs font-medium text-red-500 mr-2">
                API offline ({backendError})
              </span>
            )}
            {backendStatus && !backendError && (
              <span className="text-xs font-medium text-emerald-600 mr-2">
                {backendStatus}
              </span>
            )}
            {/* Only show manager tools for managers */}
            {(user.role === 'Manager' || user.userType === 'Manager') && (
              <>
                <button 
                    onClick={handleAutoFill}
                    disabled={isAutoFilling}
                    className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-md disabled:opacity-50"
                >
                    <i className={`fas ${isAutoFilling ? 'fa-spinner fa-spin' : 'fa-robot'}`}></i>
                    <span>{isAutoFilling ? 'משבץ...' : 'שיבוץ אוטומטי'}</span>
                </button>
                <button 
                    onClick={runAiAnalysis}
                    disabled={isAnalyzing}
                    className="flex items-center space-x-2 bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-md disabled:opacity-50"
                >
                    <i className={`fas ${isAnalyzing ? 'fa-spinner fa-spin' : 'fa-chart-line'}`}></i>
                    <span>{isAnalyzing ? 'מנתח...' : 'דו"ח ביצועים'}</span>
                </button>
              </>
            )}
            <div className="flex items-center space-x-3 ml-4 pl-4 border-l border-slate-200">
              <div className="text-right">
                <p className="text-xs font-bold text-slate-600">{user.fullName}</p>
                <p className="text-[10px] text-slate-400">{user.storeName || `Store #${user.storeId}`}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md"
                title="Logout"
              >
                <i className="fas fa-sign-out-alt"></i>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {currentPage === 'employees' ? (
        <EmployeeManagement />
      ) : currentPage === 'availability' ? (
        <EmployeeAvailability user={user} />
      ) : (user.role === 'Employee' || user.userType === 'Employee') ? (
        // Employees should only see availability page
        <EmployeeAvailability user={user} />
      ) : (
        <main className="max-w-7xl mx-auto w-full px-4 lg:px-8 py-10 flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          <KPIBanner kpis={kpis} />

          {aiAnalysis && (
            <div className="mb-8 bg-white border-2 border-indigo-500/20 rounded-2xl overflow-hidden shadow-xl animate-in slide-in-from-top duration-500">
                <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
                    <h3 className="text-white font-bold flex items-center">
                        <i className="fas fa-magic mr-2"></i>
                        ניתוח אופטימיזציה חכם
                    </h3>
                    <button onClick={() => setAiAnalysis(null)} className="text-white/80 hover:text-white">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="p-8 text-slate-800 text-base whitespace-pre-wrap leading-relaxed dir-rtl text-right">
                    {aiAnalysis}
                </div>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">לוח שיבוץ שבועי</h2>
                    <p className="text-sm text-slate-500 mt-1">גרור עובדים מהרשימה כדי לשבץ למשמרות או השתמש בשיבוץ האוטומטי</p>
                </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-100 w-32">יום</th>
                    <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">משמרת בוקר (09-15)</th>
                    <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">משמרת ערב (15-21)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DAYS.map(day => {
                    const morningShift = shifts.find(s => s.day === day && s.type === 'Morning')!;
                    const afternoonShift = shifts.find(s => s.day === day && s.type === 'Afternoon')!;
                    
                    return (
                      <tr key={day} className="group">
                        <td className="px-8 py-10 font-extrabold text-slate-900 border-r border-slate-100 bg-slate-50/30 group-hover:bg-slate-50 transition-colors">
                          {day}
                        </td>
                        <td className="px-8 py-6">
                          <ShiftSlot 
                            shift={morningShift} 
                            onDrop={(e) => handleDrop(e, morningShift.id)} 
                            onRemove={() => removeAssignment(morningShift.id)}
                            onSuggest={() => requestSmartSuggestion(morningShift)}
                            isLoading={suggestionLoading === morningShift.id}
                            assignedEmployee={employees.find(e => e.id === morningShift.assignedEmployeeId)}
                          />
                        </td>
                        <td className="px-8 py-6">
                          <ShiftSlot 
                            shift={afternoonShift} 
                            onDrop={(e) => handleDrop(e, afternoonShift.id)} 
                            onRemove={() => removeAssignment(afternoonShift.id)}
                            onSuggest={() => requestSmartSuggestion(afternoonShift)}
                            isLoading={suggestionLoading === afternoonShift.id}
                            assignedEmployee={employees.find(e => e.id === afternoonShift.assignedEmployeeId)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <EmployeeSidebar employees={employees} onDragStart={handleDragStart} />
      </main>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .dir-rtl { direction: rtl; }
      `}} />
    </div>
  );
};

interface ShiftSlotProps {
    shift: Shift;
    assignedEmployee?: Employee;
    onDrop: (e: React.DragEvent) => void;
    onRemove: () => void;
    onSuggest: () => void;
    isLoading?: boolean;
}

const ShiftSlot: React.FC<ShiftSlotProps> = ({ shift, assignedEmployee, onDrop, onRemove, onSuggest, isLoading }) => {
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.add('ring-4', 'ring-red-500/20', 'bg-red-50/50', 'border-red-400');
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('ring-4', 'ring-red-500/20', 'bg-red-50/50', 'border-red-400');
    };

    const onDropHandler = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('ring-4', 'ring-red-500/20', 'bg-red-50/50', 'border-red-400');
        onDrop(e);
    };

    if (assignedEmployee) {
        const scoreColor = assignedEmployee.productivityScore > 85 ? 'text-green-600 bg-green-50' : 
                          assignedEmployee.productivityScore > 70 ? 'text-orange-600 bg-orange-50' : 'text-red-600 bg-red-50';

        return (
            <div className="relative group bg-white border border-slate-200 rounded-2xl p-4 flex items-center shadow-sm hover:shadow-md transition-all animate-in fade-in zoom-in duration-200">
                <img src={assignedEmployee.avatar} className="w-12 h-12 rounded-full mr-4 border-2 border-white shadow-sm" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{assignedEmployee.name}</p>
                    <p className="text-xs text-slate-500 font-medium">${shift.targetSales.toLocaleString()} Target</p>
                </div>
                <div className={`ml-3 px-3 py-1 rounded-full text-xs font-black ${scoreColor}`}>
                    {assignedEmployee.productivityScore}%
                </div>
                <button 
                    onClick={onRemove}
                    className="opacity-0 group-hover:opacity-100 absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg hover:scale-110 transition-all z-10"
                >
                    <i className="fas fa-times text-xs"></i>
                </button>
            </div>
        );
    }

    return (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={onDropHandler}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-red-400 hover:text-red-500 transition-all group min-h-[90px] relative cursor-pointer"
        >
            {isLoading ? (
                <div className="flex flex-col items-center">
                    <i className="fas fa-circle-notch fa-spin text-indigo-500 mb-2"></i>
                    <span className="text-[10px] font-bold uppercase">Thinking...</span>
                </div>
            ) : (
                <>
                    <i className="fas fa-plus mb-2 opacity-30 group-hover:scale-125 transition-transform"></i>
                    <span className="text-[10px] font-bold uppercase tracking-widest">פנוי</span>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onSuggest(); }}
                        className="absolute bottom-2 right-2 bg-slate-100 hover:bg-indigo-500 hover:text-white p-2 rounded-lg text-slate-400 transition-all opacity-0 group-hover:opacity-100"
                        title="Smart Suggestion"
                    >
                        <i className="fas fa-wand-magic-sparkles text-xs"></i>
                    </button>
                </>
            )}
        </div>
    );
}

export default App;

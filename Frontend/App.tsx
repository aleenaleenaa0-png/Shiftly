
import React, { useState, useEffect, useRef } from 'react';
import { Shift, Employee, ScheduleKPIs } from './types';
import { DAYS } from './constants';
import KPIBanner from './components/KPIBanner';
import EmployeeSidebar from './components/EmployeeSidebar';
import EmployeeManagement from './components/EmployeeManagement';
import EmployeeAvailability from './components/EmployeeAvailability';
import UserManagement from './components/UserManagement';
import WorkerPortal from './components/WorkerPortal';
import Login from './components/Login';
import SignUp from './components/SignUp';
import Logo from './components/Logo';
import { getScheduleOptimizationInsights, getSmartSuggestion, autoGenerateSchedule } from './geminiService';

type Page = 'schedule' | 'employees' | 'availability' | 'users';

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
    
    // Managers can access schedule, employees, and users pages, but not availability
    if (isManager && page === 'availability') {
      setCurrentPage('schedule');
      return;
    }
    
    setCurrentPage(page);
  };
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true); // Start with true to show loading, then login
  const [authPage, setAuthPage] = useState<'login' | 'signup'>('login');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingShifts, setLoadingShifts] = useState(false);
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
  const [shiftAvailabilityMap, setShiftAvailabilityMap] = useState<Map<string, number[]>>(new Map()); // shiftId -> employeeIds
  const [employeeAvailabilityCount, setEmployeeAvailabilityCount] = useState<Map<string, number>>(new Map()); // employeeId -> count
  const availabilityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastShiftIdsRef = useRef<string>('');
  const lastEmployeeIdsRef = useRef<string>('');

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

  // Fetch employees from database - dynamic, no hardcoding
  useEffect(() => {
    if (!user || (user.role !== 'Manager' && user.userType !== 'Manager')) {
      setEmployees([]); // Clear employees if not manager
      return;
    }

    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true);
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔄 FETCHING ALL EMPLOYEES FROM ACCESS DATABASE...');
        console.log(`  Manager Store ID: ${user.storeId}`);
        console.log('═══════════════════════════════════════════════════════');
        
        const response = await fetch('/api/employees', {
          credentials: 'include',
          cache: 'no-cache' // Always get fresh data
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`✓ Received ${data.length} employees from backend`);
          
          // Map backend employees to frontend format
          const mappedEmployees: Employee[] = data.map((emp: any) => {
            const employeeId = (emp.EmployeeId || emp.employeeId).toString();
            const firstName = emp.FirstName || emp.firstName || 'Unknown';
            const hourlyWage = emp.HourlyWage || emp.hourlyWage || 25;
            const productivityScore = emp.ProductivityScore || emp.productivityScore || 70;
            
            console.log(`  - Employee ID: ${employeeId}, Name: ${firstName}, Wage: $${hourlyWage}, Productivity: ${productivityScore}%`);
            
            return {
              id: employeeId,
              name: firstName, // Use FirstName from Access database
              role: 'Associate', // Default role
              hourlyRate: hourlyWage,
              productivityScore: productivityScore,
              avatar: `https://picsum.photos/seed/${employeeId}/100`,
              availability: DAYS // Default to all days
            };
          });

          setEmployees(mappedEmployees);
          console.log(`✓ Successfully loaded ${mappedEmployees.length} employees from Access database`);
          console.log('═══════════════════════════════════════════════════════');
        } else {
          const errorText = await response.text();
          console.error(`❌ Failed to fetch employees: ${response.status} - ${errorText}`);
          setEmployees([]);
        }
      } catch (err: any) {
        console.error('❌ Error fetching employees:', err);
        setEmployees([]);
      } finally {
        setLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, [user]);

  // Fetch shifts from database - dynamic, no hardcoding
  useEffect(() => {
    if (!user || (user.role !== 'Manager' && user.userType !== 'Manager')) {
      setShifts([]); // Clear shifts if not manager
      return;
    }

    const fetchShifts = async () => {
      try {
        setLoadingShifts(true);
        console.log('🔄 Fetching shifts from Access database...');
        
        // Get current week start (Monday)
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        
        const response = await fetch(`/api/shifts?storeId=${user.storeId}&weekStart=${monday.toISOString()}`, {
          credentials: 'include',
          cache: 'no-cache'
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`✓ Received ${data.length} shifts from backend`);
          
          // Map backend shifts to frontend format
          const mappedShifts: Shift[] = data.map((shift: any) => {
            const startTime = new Date(shift.StartTime || shift.startTime);
            const endTime = new Date(shift.EndTime || shift.endTime);
            const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' });
            const startHour = startTime.getHours();
            const isMorning = startHour >= 9 && startHour < 15;
            
            return {
              id: (shift.ShiftId || shift.shiftId).toString(),
              day: dayName,
              startTime: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
              endTime: endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
              type: isMorning ? 'Morning' : 'Afternoon',
              targetSales: shift.RequiredProductivity || shift.requiredProductivity || 2500,
              assignedEmployeeId: shift.EmployeeId || shift.employeeId ? (shift.EmployeeId || shift.employeeId).toString() : null
            };
          });

          setShifts(mappedShifts);
          console.log(`✓ Successfully loaded ${mappedShifts.length} shifts from Access database`);
        } else {
          console.error(`❌ Failed to fetch shifts: ${response.status}`);
          setShifts([]);
        }
      } catch (err: any) {
        console.error('❌ Error fetching shifts:', err);
        setShifts([]);
      } finally {
        setLoadingShifts(false);
      }
    };

    fetchShifts();
  }, [user]);

  // Fetch availability for all shifts and employees - fully dynamic from database
  useEffect(() => {
    if (!user || (user.role !== 'Manager' && user.userType !== 'Manager')) {
      // Clear interval if not manager
      if (availabilityIntervalRef.current) {
        clearInterval(availabilityIntervalRef.current);
        availabilityIntervalRef.current = null;
      }
      return;
    }
    if (shifts.length === 0 || employees.length === 0) return; // Wait for shifts and employees to load

    // Use shift and employee IDs as stable references instead of the full arrays
    const shiftIds = shifts.map(s => s.id).sort().join(',');
    const employeeIds = employees.map(e => e.id).sort().join(',');

    // Only recreate interval if IDs have actually changed (prevent re-creating on every render)
    const idsChanged = shiftIds !== lastShiftIdsRef.current || employeeIds !== lastEmployeeIdsRef.current;
    
    if (idsChanged) {
      // Clear existing interval if IDs changed
      if (availabilityIntervalRef.current) {
        clearInterval(availabilityIntervalRef.current);
        availabilityIntervalRef.current = null;
      }
      
      // Update refs
      lastShiftIdsRef.current = shiftIds;
      lastEmployeeIdsRef.current = employeeIds;
    } else if (availabilityIntervalRef.current) {
      // IDs haven't changed and interval already exists, don't recreate
      return;
    }

    const fetchAvailability = async () => {
      // Only fetch if we have shifts and employees loaded
      if (shifts.length === 0 || employees.length === 0) {
        return;
      }
      
      try {
        // Fetch availability for each shift using backend shift IDs (shifts already have real IDs from database)
        // This gets employees who have marked themselves as available for each shift
        const shiftAvailabilityPromises = shifts.map(async (frontendShift) => {
          try {
            const backendShiftId = parseInt(frontendShift.id); // Frontend shift ID is the backend Shift_ID
            if (isNaN(backendShiftId)) {
              console.warn(`⚠ Invalid shift ID: ${frontendShift.id}`);
              return { shiftId: frontendShift.id, employeeIds: [] };
            }
            
            const response = await fetch(`/api/availabilities/for-shift/${backendShiftId}`, {
              credentials: 'include',
              cache: 'no-cache' // Always get fresh data from database
            });
            if (response.ok) {
              const data = await response.json();
              // Backend returns only available employees; normalize IDs to numbers for consistent comparison
              const employeeIds = (Array.isArray(data) ? data : [])
                .map((a: any) => Number(a.EmployeeId ?? a.employeeId))
                .filter((id: number) => !isNaN(id) && id > 0);
              return { shiftId: frontendShift.id, employeeIds };
            }
          } catch (err) {
            // Silently fail - will retry on next interval
          }
          return { shiftId: frontendShift.id, employeeIds: [] };
        });

        const shiftResults = await Promise.all(shiftAvailabilityPromises);
        const newShiftMap = new Map<string, number[]>();
        shiftResults.forEach(result => {
          newShiftMap.set(result.shiftId, result.employeeIds);
        });
        setShiftAvailabilityMap(newShiftMap);

        // Fetch availability count for each employee using their real backend IDs
        const employeeAvailabilityPromises = employees.map(async (frontendEmp) => {
          try {
            const backendEmpId = parseInt(frontendEmp.id); // Frontend employee ID is the backend EmployeeId
            const response = await fetch(`/api/availabilities/for-employee/${backendEmpId}`, {
              credentials: 'include',
              cache: 'no-cache'
            });
            if (response.ok) {
              const data = await response.json();
              return { employeeId: frontendEmp.id, count: data.length || 0 };
            }
          } catch (err) {
            // Silently fail - will retry on next interval
          }
          return { employeeId: frontendEmp.id, count: 0 };
        });

        const employeeResults = await Promise.all(employeeAvailabilityPromises);
        const newEmployeeMap = new Map<string, number>();
        employeeResults.forEach(result => {
          newEmployeeMap.set(result.employeeId, result.count);
        });
        setEmployeeAvailabilityCount(newEmployeeMap);
      } catch (err) {
        // Silently fail - will retry on next interval
      }
    };

    // Initial fetch
    fetchAvailability();
    // Refresh every 15 seconds to catch employee availability updates (reduced from 3s to reduce spam)
    availabilityIntervalRef.current = setInterval(fetchAvailability, 15000);
    
    return () => {
      if (availabilityIntervalRef.current) {
        clearInterval(availabilityIntervalRef.current);
        availabilityIntervalRef.current = null;
      }
    };
    // Only re-run when shifts/employees IDs actually change, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts.map(s => s.id).sort().join(','), employees.map(e => e.id).sort().join(','), user?.userId]);

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    // If employee, they will see WorkerPortal (no page navigation needed)
    // Managers go to schedule page
    if (userData.role === 'Manager' || userData.userType === 'Manager') {
      setCurrentPage('schedule');
    }
  };
  
  // Employees see WorkerPortal - no page navigation needed

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

  const handleDrop = async (e: React.DragEvent, shiftId: string) => {
    e.preventDefault();
    const employeeId = e.dataTransfer.getData('employeeId');
    if (employeeId) {
      const backendShiftId = parseInt(shiftId);
      const backendEmployeeId = parseInt(employeeId);
      const availableEmployeeIds = shiftAvailabilityMap.get(shiftId) || [];
      const isAvailableForShift = availableEmployeeIds.some((id: number | string) => Number(id) === backendEmployeeId);

      // Only block if we have data and the employee is not in the list (avoid blocking when for-shift failed or not loaded yet)
      if (availableEmployeeIds.length > 0 && !isAvailableForShift) {
        const emp = employees.find(e => e.id === employeeId);
        const name = emp?.name ?? 'This employee';
        alert(
          `Only employees who have set availability for this shift can be assigned.\n\n` +
          `${name} has not marked themselves available for this shift. ` +
          `They can set their availability in the Worker Portal (Availability / Set Availability), then you can assign them here.`
        );
        return;
      }

      // Optimistically update UI
      setShifts(prev => prev.map(s => 
          s.id === shiftId ? { ...s, assignedEmployeeId: employeeId } : s
      ));
      
      // Save to database using the assign endpoint
      try {
        const response = await fetch(`/api/shifts/${backendShiftId}/assign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            employeeId: backendEmployeeId
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // Revert on error
          setShifts(prev => prev.map(s => 
              s.id === shiftId ? { ...s, assignedEmployeeId: null } : s
          ));
          console.error('Failed to assign employee to shift');
          alert(errorData.message || 'Failed to assign employee to shift. Please try again.');
        } else {
          console.log(`✓ Assigned employee ${employeeId} to shift ${shiftId} in database`);
          // Refresh shifts to get updated data from database
          if (user) {
            const today = new Date();
            const day = today.getDay();
            const diff = today.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(today.setDate(diff));
            monday.setHours(0, 0, 0, 0);
            
            const shiftsResponse = await fetch(`/api/shifts?storeId=${user.storeId}&weekStart=${monday.toISOString()}`, {
              credentials: 'include'
            });
            if (shiftsResponse.ok) {
              const data = await shiftsResponse.json();
              const mappedShifts: Shift[] = data.map((shift: any) => {
                const startTime = new Date(shift.StartTime || shift.startTime);
                const endTime = new Date(shift.EndTime || shift.endTime);
                const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' });
                const startHour = startTime.getHours();
                const isMorning = startHour >= 9 && startHour < 15;
                
                return {
                  id: (shift.ShiftId || shift.shiftId).toString(),
                  day: dayName,
                  startTime: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
                  endTime: endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
                  type: isMorning ? 'Morning' : 'Afternoon',
                  targetSales: shift.RequiredProductivity || shift.requiredProductivity || 2500,
                  assignedEmployeeId: shift.EmployeeId || shift.employeeId ? (shift.EmployeeId || shift.employeeId).toString() : null
                };
              });
              setShifts(mappedShifts);
            }
          }
        }
      } catch (err) {
        console.error('Error assigning employee to shift:', err);
        // Revert on error
        setShifts(prev => prev.map(s => 
            s.id === shiftId ? { ...s, assignedEmployeeId: null } : s
        ));
        alert('Error assigning employee to shift. Please try again.');
      }
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
    
    // Fast local analysis - instant results
    const analysis = generateFastPerformanceReport(shifts, employees);
    setAiAnalysis(analysis);
    setIsAnalyzing(false);
  };

  const generateFastPerformanceReport = (shifts: Shift[], employees: Employee[]): string => {
    const assignedShifts = shifts.filter(s => s.assignedEmployeeId);
    const unassignedShifts = shifts.filter(s => !s.assignedEmployeeId);
    const totalShifts = shifts.length;
    const coveragePercent = Math.round((assignedShifts.length / totalShifts) * 100);
    
    // Calculate total cost and sales
    let totalCost = 0;
    let totalTargetSales = 0;
    let totalExpectedSales = 0;
    const shiftHours = 6; // 6 hours per shift
    
    assignedShifts.forEach(shift => {
      const employee = employees.find(e => e.id === shift.assignedEmployeeId);
      if (employee) {
        totalCost += employee.hourlyRate * shiftHours;
        totalTargetSales += shift.targetSales;
        // Expected sales based on productivity (productivity score as percentage of target)
        totalExpectedSales += shift.targetSales * (employee.productivityScore / 100);
      }
    });
    
    const efficiencyRatio = totalCost > 0 ? totalTargetSales / totalCost : 0;
    const expectedEfficiencyRatio = totalCost > 0 ? totalExpectedSales / totalCost : 0;
    
    // Analyze employee assignments
    const employeeShiftCounts: Record<string, { count: number; employee: Employee }> = {};
    const highValueShifts = shifts.filter(s => s.targetSales >= 3000);
    const highValueAssigned = highValueShifts.filter(s => s.assignedEmployeeId);
    
    assignedShifts.forEach(shift => {
      const employee = employees.find(e => e.id === shift.assignedEmployeeId);
      if (employee) {
        if (!employeeShiftCounts[employee.id]) {
          employeeShiftCounts[employee.id] = { count: 0, employee };
        }
        employeeShiftCounts[employee.id].count++;
      }
    });
    
    // Find best and worst assignments
    const sortedByProductivity = [...assignedShifts]
      .map(s => ({
        shift: s,
        employee: employees.find(e => e.id === s.assignedEmployeeId),
        matchScore: (employees.find(e => e.id === s.assignedEmployeeId)?.productivityScore || 0) / s.targetSales
      }))
      .filter(s => s.employee)
      .sort((a, b) => (b.employee?.productivityScore || 0) - (a.employee?.productivityScore || 0));
    
    const bestMatches = sortedByProductivity.slice(0, 3);
    const worstMatches = sortedByProductivity.slice(-3).reverse();
    
    // Cost optimization opportunities
    const avgHourlyRate = assignedShifts.length > 0 
      ? totalCost / (assignedShifts.length * shiftHours)
      : 0;
    const highCostEmployees = Object.values(employeeShiftCounts)
      .filter(e => e.employee.hourlyRate > avgHourlyRate * 1.2)
      .sort((a, b) => b.employee.hourlyRate - a.employee.hourlyRate);
    
    // Build report
    let report = `# 📊 דוח ביצועים - ניתוח מיידי\n\n`;
    
    report += `## 1️⃣ ניתוח כיסוי\n`;
    report += `- **כיסוי משמרות:** ${coveragePercent}% (${assignedShifts.length}/${totalShifts})\n`;
    report += `- **משמרות לא מאוישות:** ${unassignedShifts.length}\n`;
    if (unassignedShifts.length > 0) {
      report += `- **⚠️ משמרות שדורשות שיבוץ:** ${unassignedShifts.map(s => `${s.day} ${s.type}`).join(', ')}\n`;
    }
    report += `- **כיסוי משמרות ערך גבוה:** ${Math.round((highValueAssigned.length / highValueShifts.length) * 100)}% (${highValueAssigned.length}/${highValueShifts.length})\n\n`;
    
    report += `## 2️⃣ אופטימיזציית מכירות\n`;
    report += `- **יעד מכירות כולל:** $${totalTargetSales.toLocaleString()}\n`;
    report += `- **מכירות צפויות (על בסיס תפוקה):** $${Math.round(totalExpectedSales).toLocaleString()}\n`;
    report += `- **יחס יעילות (מכירות/עלות):** ${efficiencyRatio.toFixed(2)}\n`;
    report += `- **יחס יעילות צפוי:** ${expectedEfficiencyRatio.toFixed(2)}\n\n`;
    
    if (bestMatches.length > 0) {
      report += `**✅ השיבוצים הטובים ביותר:**\n`;
      bestMatches.forEach((match, i) => {
        report += `${i + 1}. ${match.employee?.name} (תפוקה: ${match.employee?.productivityScore}%) → ${match.shift.day} ${match.shift.type} (יעד: $${match.shift.targetSales.toLocaleString()})\n`;
      });
      report += `\n`;
    }
    
    report += `## 3️⃣ ניהול עלויות\n`;
    report += `- **עלות כוללת:** $${totalCost.toLocaleString()}\n`;
    report += `- **עלות ממוצעת לשעה:** $${avgHourlyRate.toFixed(2)}\n`;
    report += `- **עלות למשמרת ממוצעת:** $${(totalCost / assignedShifts.length || 0).toFixed(2)}\n\n`;
    
    if (highCostEmployees.length > 0) {
      report += `**💰 הזדמנויות לחיסכון:**\n`;
      highCostEmployees.slice(0, 3).forEach(emp => {
        const savings = (emp.employee.hourlyRate - avgHourlyRate) * emp.count * shiftHours;
        report += `- ${emp.employee.name}: $${emp.employee.hourlyRate}/שעה (${emp.count} משמרות) - חיסכון פוטנציאלי: $${Math.round(savings)}\n`;
      });
      report += `\n`;
    }
    
    report += `## 4️⃣ סיכום והמלצות\n`;
    const recommendations: string[] = [];
    
    if (unassignedShifts.length > 0) {
      recommendations.push(`שיבוץ ${unassignedShifts.length} משמרות לא מאוישות`);
    }
    
    if (coveragePercent < 80) {
      recommendations.push(`שיפור כיסוי המשמרות (כרגע ${coveragePercent}%)`);
    }
    
    if (efficiencyRatio < 8) {
      recommendations.push(`שיפור יחס יעילות (כרגע ${efficiencyRatio.toFixed(2)})`);
    }
    
    if (highCostEmployees.length > 0) {
      recommendations.push(`בחינת שיבוץ עובדים בעלי עלות גבוהה למשמרות ערך גבוה בלבד`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push(`הסידור נראה מאוזן ויעיל!`);
    }
    
    recommendations.forEach((rec, i) => {
      report += `${i + 1}. ${rec}\n`;
    });
    
    report += `\n---\n`;
    report += `*דוח נוצר ב-${new Date().toLocaleString('he-IL')}*\n`;
    
    return report;
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

  const removeAssignment = async (shiftId: string) => {
    // Optimistically update UI
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, assignedEmployeeId: null } : s));
    
    // Save to database - remove employee assignment
    try {
      const backendShiftId = parseInt(shiftId); // Frontend shift ID is the backend Shift_ID
      
      const response = await fetch(`/api/shifts/${backendShiftId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          employeeId: null // Set to null to remove assignment
        })
      });
      
      if (!response.ok) {
        console.error('Failed to remove employee assignment from shift');
        // Refresh shifts to get correct state
        if (user) {
          const today = new Date();
          const day = today.getDay();
          const diff = today.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(today.setDate(diff));
          monday.setHours(0, 0, 0, 0);
          
          const shiftsResponse = await fetch(`/api/shifts?storeId=${user.storeId}&weekStart=${monday.toISOString()}`, {
            credentials: 'include'
          });
          if (shiftsResponse.ok) {
            const data = await shiftsResponse.json();
            const mappedShifts: Shift[] = data.map((shift: any) => {
              const startTime = new Date(shift.StartTime || shift.startTime);
              const endTime = new Date(shift.EndTime || shift.endTime);
              const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' });
              const startHour = startTime.getHours();
              const isMorning = startHour >= 9 && startHour < 15;
              
              return {
                id: (shift.ShiftId || shift.shiftId).toString(),
                day: dayName,
                startTime: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
                endTime: endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
                type: isMorning ? 'Morning' : 'Afternoon',
                targetSales: shift.RequiredProductivity || shift.requiredProductivity || 2500,
                assignedEmployeeId: shift.EmployeeId || shift.employeeId ? (shift.EmployeeId || shift.employeeId).toString() : null
              };
            });
            setShifts(mappedShifts);
          }
        }
      } else {
        console.log(`✓ Removed employee assignment from shift ${shiftId} in database`);
      }
    } catch (err) {
      console.error('Error removing employee assignment:', err);
    }
  };

  // Show login page if not authenticated
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center relative bg-gradient-to-br from-rose-50 via-purple-50 to-cyan-50">
        <div className="text-center relative z-10">
          <i className="fas fa-spinner fa-spin text-5xl text-rose-500 mb-4"></i>
          <p className="text-slate-700 font-semibold">Loading <span className="text-rose-500 font-black">Shiftly</span>...</p>
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
    <div className="min-h-screen flex flex-col relative">
      {/* Live animated background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              width: `${Math.random() * 8 + 4}px`,
              height: `${Math.random() * 8 + 4}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: i % 3 === 0 ? 'rgba(251, 113, 133, 0.4)' : i % 3 === 1 ? 'rgba(168, 85, 247, 0.4)' : 'rgba(34, 211, 238, 0.4)',
              animation: `floatParticle ${10 + Math.random() * 15}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
              filter: 'blur(1px)'
            }}
          />
        ))}
      </div>
      
      <style>{`
        @keyframes floatParticle {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.3;
          }
          25% {
            transform: translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) scale(1.5);
            opacity: 0.6;
          }
          50% {
            transform: translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) scale(0.8);
            opacity: 0.4;
          }
          75% {
            transform: translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) scale(1.2);
            opacity: 0.5;
          }
        }
      `}</style>
      
      <nav className="relative bg-white/90 backdrop-blur-xl border-b border-rose-200/60 shadow-lg shadow-rose-500/5 px-6 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3 min-w-0">
            <Logo size="small" showText={false} />
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">
                  Shiftly
                </span>
                <span className="hidden sm:inline-block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Smart Scheduling
                </span>
              </div>
              {(user.role === 'Manager' || user.userType === 'Manager') && (
                <span className="text-[9px] text-rose-500 font-semibold mt-0.5">
                  <i className="fas fa-user-shield mr-1"></i>Manager Dashboard
                </span>
              )}
              {(user.role === 'Employee' || user.userType === 'Employee') && (
                <span className="text-[9px] text-purple-500 font-semibold mt-0.5">
                  <i className="fas fa-user mr-1"></i>Employee Portal
                </span>
              )}
            </div>
          </div>

          {/* Navigation Menu */}
          <div className="flex items-center space-x-2 flex-wrap">
            {/* Only show Schedule for managers */}
            {(user.role === 'Manager' || user.userType === 'Manager') && (
              <button
                onClick={() => setPage('schedule')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center ${
                  currentPage === 'schedule'
                    ? 'bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 text-white shadow-md shadow-rose-500/30 transform hover:scale-105'
                    : 'text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                }`}
              >
                <i className="fas fa-calendar-alt mr-2"></i>
                <span>Schedule</span>
              </button>
            )}
            
            {/* Only show manager pages for managers */}
            {(user.role === 'Manager' || user.userType === 'Manager') && (
              <>
                <button
                  onClick={() => setPage('employees')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center ${
                    currentPage === 'employees'
                      ? 'bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 text-white shadow-md shadow-rose-500/30 transform hover:scale-105'
                      : 'text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                  }`}
                >
                  <i className="fas fa-users mr-2"></i>
                  <span>Employees</span>
                </button>
                <button
                  onClick={() => setPage('users')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center ${
                    currentPage === 'users'
                      ? 'bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 text-white shadow-md shadow-rose-500/30 transform hover:scale-105'
                      : 'text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                  }`}
                >
                  <i className="fas fa-user-shield mr-2"></i>
                  <span>Users</span>
                </button>
              </>
            )}
            
            {/* Employees don't see navigation - they have their own portal */}
          </div>

          {/* Right Side: Tools and User Info */}
          <div className="flex items-center space-x-3 flex-wrap">
            {/* Backend Status */}
            <div className="hidden lg:flex items-center space-x-2">
              {backendError && (
                <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded-full">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  Offline
                </span>
              )}
              {backendStatus && !backendError && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <i className="fas fa-check-circle mr-1"></i>
                  Connected
                </span>
              )}
            </div>

            {/* Manager Tools */}
            {(user.role === 'Manager' || user.userType === 'Manager') && (
              <div className="flex items-center space-x-2">
                <button 
                    onClick={async () => {
                      if (!confirm('This will delete and recreate all shifts for the current week and next 4 weeks. Continue?')) {
                        return;
                      }
                      try {
                        const response = await fetch(`/api/shifts/reinitialize?storeId=${user.storeId}`, {
                          method: 'POST',
                          credentials: 'include'
                        });
                        if (response.ok) {
                          const data = await response.json();
                          alert(`Success! ${data.message}\nDeleted: ${data.shiftsDeleted} shifts\nCreated: ${data.shiftsCreated} shifts`);
                          // Refresh shifts
                          const today = new Date();
                          const day = today.getDay();
                          const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                          const monday = new Date(today.setDate(diff));
                          monday.setHours(0, 0, 0, 0);
                          const shiftsResponse = await fetch(`/api/shifts?storeId=${user.storeId}&weekStart=${monday.toISOString()}`, {
                            credentials: 'include'
                          });
                          if (shiftsResponse.ok) {
                            const shiftsData = await shiftsResponse.json();
                            const mappedShifts: Shift[] = shiftsData.map((shift: any) => {
                              const startTime = new Date(shift.StartTime || shift.startTime);
                              const endTime = new Date(shift.EndTime || shift.endTime);
                              const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' });
                              const startHour = startTime.getHours();
                              const isMorning = startHour >= 9 && startHour < 15;
                              return {
                                id: (shift.ShiftId || shift.shiftId).toString(),
                                day: dayName,
                                startTime: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
                                endTime: endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
                                type: isMorning ? 'Morning' : 'Afternoon',
                                targetSales: shift.RequiredProductivity || shift.requiredProductivity || 2500,
                                assignedEmployeeId: shift.EmployeeId || shift.employeeId ? (shift.EmployeeId || shift.employeeId).toString() : null
                              };
                            });
                            setShifts(mappedShifts);
                          }
                        } else {
                          const errorData = await response.json().catch(() => ({}));
                          alert(`Error: ${errorData.message || errorData.error || 'Failed to reinitialize shifts'}`);
                        }
                      } catch (err: any) {
                        alert(`Error: ${err.message}`);
                      }
                    }}
                    className="flex items-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                    title="Reinitialize Shifts (Delete and Recreate)"
                >
                    <i className="fas fa-redo"></i>
                    <span className="hidden sm:inline ml-2">Reinit Shifts</span>
                </button>
                <button 
                    onClick={handleAutoFill}
                    disabled={isAutoFilling}
                    className="flex items-center space-x-2 bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 hover:from-rose-400 hover:via-purple-400 hover:to-cyan-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-rose-500/30 hover:shadow-lg hover:shadow-rose-500/40 disabled:opacity-50 transform hover:scale-105 active:scale-95 relative overflow-hidden group"
                    title="Auto Schedule Shifts"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>
                  <span className="relative z-10 flex items-center">
                    <i className={`fas ${isAutoFilling ? 'fa-spinner fa-spin' : 'fa-magic'}`}></i>
                    <span className="hidden sm:inline ml-2">Auto Schedule</span>
                  </span>
                </button>
                <button 
                    onClick={runAiAnalysis}
                    disabled={isAnalyzing}
                    className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 transform hover:scale-105 active:scale-95"
                    title="Performance Report"
                >
                    <i className={`fas ${isAnalyzing ? 'fa-spinner fa-spin' : 'fa-chart-line'}`}></i>
                    <span className="hidden sm:inline ml-2">Report</span>
                </button>
              </div>
            )}

            {/* User Info and Logout */}
            <div className="flex items-center space-x-3 pl-3 border-l border-rose-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-700">{user.fullName}</p>
                <p className="text-[10px] text-slate-500 flex items-center">
                  <i className="fas fa-store mr-1"></i>
                  {user.storeName || `Store #${user.storeId}`}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                title="Logout"
              >
                <i className="fas fa-sign-out-alt"></i>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {(user.role === 'Employee' || user.userType === 'Employee') ? (
        // Employees see the Worker Portal
        <WorkerPortal user={user} onLogout={handleLogout} />
      ) : currentPage === 'employees' ? (
        <EmployeeManagement user={user} />
      ) : currentPage === 'users' ? (
        <UserManagement />
      ) : currentPage === 'availability' ? (
        <EmployeeAvailability user={user} />
      ) : (
        <main className="relative z-10 max-w-7xl mx-auto w-full px-4 lg:px-8 py-10 flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          <KPIBanner kpis={kpis} />

          {aiAnalysis && (
            <div className="mb-8 bg-white/80 backdrop-blur-2xl border-2 border-rose-300/50 rounded-2xl overflow-hidden shadow-2xl shadow-rose-500/20 animate-in slide-in-from-top duration-500">
                <div className="bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 px-6 py-4 flex items-center justify-between">
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

          <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-rose-500/10 border border-rose-200/50 overflow-hidden">
            <div className="p-8 border-b border-rose-200 flex items-center justify-between bg-gradient-to-r from-white to-rose-50/50">
                <div>
                    <h2 className="text-xl font-black text-slate-800">לוח שיבוץ שבועי - <span className="text-2xl bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">Shiftly</span></h2>
                    <p className="text-sm text-slate-600 mt-1">גרור עובדים מהרשימה כדי לשבץ למשמרות או השתמש בשיבוץ האוטומטי</p>
                    {employees.length > 0 && (
                      <p className="text-xs text-green-600 font-bold mt-2">
                        <i className="fas fa-check-circle mr-1"></i>
                        {employees.length} employees loaded from database
                      </p>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-gradient-to-r from-rose-50 to-purple-50">
                    <th className="px-8 py-5 text-[11px] font-black text-slate-700 uppercase tracking-widest border-r border-rose-200 w-32">יום</th>
                    <th className="px-8 py-5 text-[11px] font-black text-slate-700 uppercase tracking-widest">משמרת בוקר (09-15)</th>
                    <th className="px-8 py-5 text-[11px] font-black text-slate-700 uppercase tracking-widest">משמרת ערב (15-21)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {loadingShifts ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-12 text-center">
                        <i className="fas fa-spinner fa-spin text-rose-500 text-2xl mb-2"></i>
                        <p className="text-slate-600 font-bold">Loading shifts from database...</p>
                      </td>
                    </tr>
                  ) : shifts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-12 text-center">
                        <i className="fas fa-calendar-times text-slate-400 text-2xl mb-2"></i>
                        <p className="text-slate-600 font-bold">No shifts found</p>
                        <p className="text-slate-500 text-sm mt-1">Shifts will appear here once they are created</p>
                      </td>
                    </tr>
                  ) : (
                    DAYS.map(day => {
                      const morningShift = shifts.find(s => s.day === day && s.type === 'Morning');
                      const afternoonShift = shifts.find(s => s.day === day && s.type === 'Afternoon');
                      
                      return (
                        <tr key={day} className="group">
                          <td className="px-8 py-10 font-extrabold text-slate-800 border-r border-rose-200 bg-rose-50/50 group-hover:bg-rose-100 transition-colors">
                            {day}
                          </td>
                          <td className="px-8 py-6">
                            {morningShift ? (
                              <ShiftSlot 
                                shift={morningShift} 
                                onDrop={(e) => handleDrop(e, morningShift.id)} 
                                onRemove={() => removeAssignment(morningShift.id)}
                                onSuggest={() => requestSmartSuggestion(morningShift)}
                                isLoading={suggestionLoading === morningShift.id}
                                assignedEmployee={employees.find(e => e.id === morningShift.assignedEmployeeId)}
                                availableEmployeeIds={shiftAvailabilityMap.get(morningShift.id) || []}
                                allEmployees={employees}
                              />
                            ) : (
                              <div className="border-2 border-dashed border-rose-300 rounded-2xl p-6 text-center text-slate-400">
                                <i className="fas fa-calendar-times mb-2"></i>
                                <p className="text-xs">No morning shift</p>
                              </div>
                            )}
                          </td>
                          <td className="px-8 py-6">
                            {afternoonShift ? (
                              <ShiftSlot 
                                shift={afternoonShift} 
                                onDrop={(e) => handleDrop(e, afternoonShift.id)} 
                                onRemove={() => removeAssignment(afternoonShift.id)}
                                onSuggest={() => requestSmartSuggestion(afternoonShift)}
                                isLoading={suggestionLoading === afternoonShift.id}
                                assignedEmployee={employees.find(e => e.id === afternoonShift.assignedEmployeeId)}
                                availableEmployeeIds={shiftAvailabilityMap.get(afternoonShift.id) || []}
                                allEmployees={employees}
                              />
                            ) : (
                              <div className="border-2 border-dashed border-rose-300 rounded-2xl p-6 text-center text-slate-400">
                                <i className="fas fa-calendar-times mb-2"></i>
                                <p className="text-xs">No afternoon shift</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <EmployeeSidebar 
          employees={employees} 
          onDragStart={handleDragStart}
          employeeAvailabilityCount={employeeAvailabilityCount}
          loading={loadingEmployees}
        />
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
    availableEmployeeIds?: number[];
    allEmployees?: Employee[];
}

const ShiftSlot: React.FC<ShiftSlotProps> = ({ shift, assignedEmployee, onDrop, onRemove, onSuggest, isLoading, availableEmployeeIds = [], allEmployees = [] }) => {
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
            <div className="relative group bg-white/90 backdrop-blur-sm border border-rose-200 rounded-2xl p-4 flex items-center shadow-lg hover:shadow-xl transition-all animate-in fade-in zoom-in duration-200 hover:scale-105">
                <img src={assignedEmployee.avatar} className="w-12 h-12 rounded-full mr-4 border-2 border-rose-200 shadow-sm" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{assignedEmployee.name}</p>
                    <p className="text-xs text-slate-600 font-medium">${shift.targetSales.toLocaleString()} Target</p>
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

        const availableEmployees = allEmployees.filter(emp =>
            availableEmployeeIds.some((id: number | string) => Number(id) === Number(emp.id))
        );

        return (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={onDropHandler}
            className="border-2 border-dashed border-rose-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-rose-400 hover:text-rose-500 hover:bg-rose-50 transition-all group min-h-[90px] relative cursor-pointer bg-white/50"
        >
            {isLoading ? (
                <div className="flex flex-col items-center">
                    <i className="fas fa-circle-notch fa-spin text-rose-500 mb-2"></i>
                    <span className="text-[10px] font-bold uppercase">Thinking...</span>
                </div>
            ) : (
                <>
                    <i className="fas fa-plus mb-2 opacity-30 group-hover:scale-125 transition-transform"></i>
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                        {availableEmployees.length > 0 ? 'Drag available employee here' : 'Empty'}
                    </span>
                    {availableEmployees.length > 0 ? (
                        <div className="mt-2 w-full">
                            <div className="flex items-center justify-center space-x-1 mb-1">
                                <span className="text-[9px] text-green-600 font-bold">
                                    <i className="fas fa-check-circle mr-1"></i>
                                    {availableEmployees.length} available — drag from sidebar
                                </span>
                            </div>
                            <div className="flex flex-wrap justify-center gap-1 mt-1">
                                {availableEmployees.slice(0, 5).map((emp) => (
                                    <span
                                        key={emp.id}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-[9px] font-semibold border border-green-300"
                                        title={`${emp.name} — ${emp.productivityScore}%`}
                                    >
                                        {emp.name.split(' ')[0]}
                                    </span>
                                ))}
                                {availableEmployees.length > 5 && (
                                    <span className="text-[9px] text-green-600 font-bold">+{availableEmployees.length - 5}</span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 text-[9px] text-slate-400 italic text-center px-2">
                            No one has set availability for this shift. Ask employees to set availability in the Worker Portal.
                        </div>
                    )}
                    <button 
                        onClick={(e) => { e.stopPropagation(); onSuggest(); }}
                        className="absolute bottom-2 right-2 bg-white hover:bg-gradient-to-r hover:from-rose-500 hover:via-purple-500 hover:to-cyan-500 hover:text-white p-2 rounded-lg text-slate-400 transition-all opacity-0 group-hover:opacity-100 shadow-md pointer-events-auto"
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

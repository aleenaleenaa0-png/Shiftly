/**
 * =============================================================================
 * App.tsx — الواجهة الرئيسية لـ Shiftly
 * =============================================================================
 *
 * تدفق المستخدم:
 * 1) غير مسجّل → Login أو SignUp
 * 2) مدير → schedule (جدول) | employees | users
 * 3) عامل → WorkerPortal (توفر + جدولي)
 *
 * للمختبر — سيناريو كامل:
 * أ) عامل: SignUp → Login → حدّد توفر (عدة فتحات)
 * ب) مدير: Login → Schedule → تحقق من شارات التوفر → اسحب عاملاً → Publish
 * ج) عامل: تبويب Schedule → يظهر الجدول بعد النشر
 *
 * خرائط مهمة في هذا الملف:
 * - shiftAvailabilityMap: لكل مناوبة، قائمة معرّفات العمال المتاحين
 * - employeeAvailabilityMap: لكل عامل، الفتحات 1–14 (true/false)
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import { Shift, Employee, ScheduleKPIs } from './types';
import { DAYS } from './constants';
import KPIBanner from './components/KPIBanner';
import ScheduleReportPanel from './components/ScheduleReportPanel';
import EmployeeSidebar from './components/EmployeeSidebar';
import EmployeeManagement from './components/EmployeeManagement';
import EmployeeAvailability from './components/EmployeeAvailability';
import UserManagement from './components/UserManagement';
import WorkerPortal from './components/WorkerPortal';
import Login from './components/Login';
import SignUp from './components/SignUp';
import Logo from './components/Logo';
import ProductivityWarningModal, {
  ProductivityWarningContext,
} from './components/ProductivityWarningModal';
import {
  calculateProjectedThroughput,
  normalizeProductivityScore,
  passesThroughputThreshold,
  STANDARD_SHIFT_HOURS,
} from './utils/throughput';
import {
  formatWeekStartParam,
  getWeekMonday,
  buildShiftsBySlotMap,
  countWeeklyShiftCoverage,
  mapApiShiftToShift,
  getShiftForDaySlot,
  WEEKLY_SHIFT_SLOT_COUNT,
  formatDayHe,
} from './utils/week';
import { formatUserRoleHe, formatShiftTypeHe } from './utils/labelsHe';
import { buildScheduleReport } from './utils/scheduleReport';
import WeekNavigator from './components/WeekNavigator';
import AppToast from './components/AppToast';
import BackgroundParticles from './components/BackgroundParticles';
import { notify } from './utils/notify';
import {
  MAX_SHIFTS_PER_EMPLOYEE_WEEK,
  buildEmployeeAssignmentCounts,
  canAssignEmployeeToShift,
} from './utils/scheduleLimits';
import { runFastAutoSchedule, pickBestEmployeeForShift } from './utils/autoSchedule';

type Page = 'schedule' | 'employees' | 'availability' | 'users';

interface User {
  userId: number;
  fullName: string;
  email: string;
  role?: string;
  userType?: string;
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('schedule');
  
  // منع العامل من فتح صفحات المدير والعكس
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
    projectedSales: 0,
    salesPerPayrollDollar: 0,
    coveragePercentage: 0,
    filledShifts: 0,
    totalShifts: WEEKLY_SHIFT_SLOT_COUNT,
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [shiftAvailabilityMap, setShiftAvailabilityMap] = useState<Map<string, number[]>>(new Map()); // shiftId -> employeeIds
  const [employeeAvailabilityCount, setEmployeeAvailabilityCount] = useState<Map<string, number>>(new Map()); // employeeId -> count
  const [employeeAvailabilityMap, setEmployeeAvailabilityMap] = useState<Map<string, Record<string, boolean>>>(new Map()); // employeeId -> availabilityMap (slot 1-14 -> boolean)
  const availabilityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fetchAvailabilityRef = useRef<() => Promise<void>>(async () => {});
  const [productivityWarning, setProductivityWarning] =
    useState<ProductivityWarningContext | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<{
    shiftId: string;
    employeeId: string;
  } | null>(null);
  const [weekMonday, setWeekMonday] = useState(() => getWeekMonday());
  const [schedulePublished, setSchedulePublished] = useState(false);
  const [publishingSchedule, setPublishingSchedule] = useState(false);

  const shiftsBySlot = useMemo(() => buildShiftsBySlotMap(shifts), [shifts]);

  const employeeAssignmentCount = useMemo(
    () => buildEmployeeAssignmentCounts(
      shifts,
      employees.map((e) => e.id)
    ),
    [shifts, employees]
  );

  const scheduleReportData = useMemo(
    () =>
      buildScheduleReport(
        shifts,
        employees,
        shiftAvailabilityMap,
        employeeAvailabilityMap
      ),
    [shifts, employees, shiftAvailabilityMap, employeeAvailabilityMap]
  );

  useEffect(() => {
    const bySlot = buildShiftsBySlotMap(shifts);
    let totalCost = 0;
    let totalTargetSales = 0;
    let projectedSales = 0;

    for (let slot = 1; slot <= WEEKLY_SHIFT_SLOT_COUNT; slot++) {
      const shift = bySlot.get(slot);
      const target = shift?.targetSales ?? (slot % 2 === 1 ? 2500 : 3500);
      totalTargetSales += target;
      if (shift?.assignedEmployeeId) {
        const employee = employees.find(e => e.id === shift.assignedEmployeeId);
        if (employee) {
          totalCost += employee.hourlyRate * STANDARD_SHIFT_HOURS;
          projectedSales += calculateProjectedThroughput(employee.productivityScore, shift);
        }
      }
    }

    const coverage = countWeeklyShiftCoverage(shifts);

    setKpis({
      totalCost,
      totalTargetSales,
      projectedSales,
      salesPerPayrollDollar: totalCost > 0 ? totalTargetSales / totalCost : 0,
      coveragePercentage: coverage.percentage,
      filledShifts: coverage.filled,
      totalShifts: coverage.total,
    });
  }, [shifts, employees]);

  // ─── عند فتح التطبيق: هل هناك جلسة دخول سابقة؟ (/api/account/me) ───
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
            `מחובר (עובדים: ${data.employees ?? 0}, משמרות: ${data.shifts ?? 0})`
          );
        }
      } catch (err: any) {
        setBackendError(err.message ?? 'Failed to reach backend');
      }
    };

    checkBackend();
  }, []);

  // ─── المدير فقط: جلب قائمة العمال من Access ───
  useEffect(() => {
    if (!user || (user.role !== 'Manager' && user.userType !== 'Manager')) {
      setEmployees([]); // Clear employees if not manager
      return;
    }

    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true);
        const response = await fetch('/api/employees', {
          credentials: 'include',
          cache: 'no-cache' // Always get fresh data
        });

        if (response.ok) {
          const data = await response.json();
          const mappedEmployees: Employee[] = data.map((emp: any) => {
            const employeeId = (emp.EmployeeId || emp.employeeId).toString();
            const firstName = emp.FirstName || emp.firstName || 'Unknown';
            const hourlyWage = emp.HourlyWage || emp.hourlyWage || 25;
            const productivityScore = emp.ProductivityScore || emp.productivityScore || 5;
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

          // Filter out "wow", "test", and "root" users (case-insensitive) from drag-and-drop list
          const filteredEmployees = mappedEmployees.filter(emp => {
            const name = (emp.name || '').trim().toLowerCase();
            const excludedNames = ['wow', 'test', 'root'];
            return !excludedNames.includes(name);
          });

          setEmployees(filteredEmployees);
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

  // ─── المدير فقط: جلب 14 مناوبة للأسبوع الحالي ───
  useEffect(() => {
    if (!user || (user.role !== 'Manager' && user.userType !== 'Manager')) {
      setShifts([]); // Clear shifts if not manager
      return;
    }

    const fetchShifts = async () => {
      try {
        setLoadingShifts(true);
        const weekParam = formatWeekStartParam(weekMonday);
        const response = await fetch(`/api/shifts?weekStart=${weekParam}`, {
          credentials: 'include',
          cache: 'no-cache'
        });

        if (response.ok) {
          const data = await response.json();
          const mappedShifts: Shift[] = data.map((shift: Record<string, unknown>) =>
            mapApiShiftToShift(shift)
          );
          setShifts(mappedShifts);
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
  }, [user, weekMonday]);

  useEffect(() => {
    const isManager = user && (user.role === 'Manager' || user.userType === 'Manager');
    if (!isManager) return;
    const weekParam = formatWeekStartParam(weekMonday);
    fetch(`/api/schedule/publish/status?weekStart=${weekParam}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSchedulePublished(Boolean(data?.published)))
      .catch(() => setSchedulePublished(false));
  }, [user, weekMonday]);

  // ─── جلب توفر كل العمال من قاعدة Access (לلشريط الجانبي والسحب) ───
  const fetchAvailability = useCallback(async () => {
    if (shifts.length === 0 || employees.length === 0) return;

    try {
      const weekParam = formatWeekStartParam(weekMonday);
      const response = await fetch(
        `/api/availabilities/manager-summary?weekStart=${encodeURIComponent(weekParam)}`,
        { credentials: 'include', cache: 'no-store' }
      );

      if (!response.ok) {
        console.error('Manager: manager-summary failed', response.status, await response.text());
        return;
      }

      const data = await response.json();
      const byEmployee: Record<string, Record<string, boolean>> = data.byEmployee || data.ByEmployee || {};
      const byShiftId: Record<string, number[]> = data.byShiftId || data.ByShiftId || {};

      const newShiftMap = new Map<string, number[]>();
      shifts.forEach(s => {
        const ids = (byShiftId[s.id] || []).map((id: number) => Number(id)).filter(id => !isNaN(id) && id > 0);
        newShiftMap.set(s.id, ids);
      });

      const newEmployeeMap = new Map<string, number>();
      const newAvailabilityMap = new Map<string, Record<string, boolean>>();

      employees.forEach(emp => {
        const map = byEmployee[emp.id] || byEmployee[String(emp.id)] || {};
        const count = Object.values(map).filter(v => v === true).length;
        newEmployeeMap.set(emp.id, count);
        newAvailabilityMap.set(emp.id, map);
      });

      setShiftAvailabilityMap(newShiftMap);
      setEmployeeAvailabilityCount(newEmployeeMap);
      setEmployeeAvailabilityMap(newAvailabilityMap);
    } catch (err) {
      console.error('Manager: Error loading availability summary:', err);
    }
  }, [shifts, employees, weekMonday]);

  fetchAvailabilityRef.current = fetchAvailability;

  // تحديث التوفر كل 5 ثوانٍ وأيضاً عند العودة للتبويب (حتى يرى المدير تغييرات العامل)
  useEffect(() => {
    const isManager = user && (user.role === 'Manager' || user.userType === 'Manager');
    if (!isManager || currentPage !== 'schedule') {
      if (availabilityIntervalRef.current) {
        clearInterval(availabilityIntervalRef.current);
        availabilityIntervalRef.current = null;
      }
      return;
    }
    if (shifts.length === 0 || employees.length === 0) return;

    const run = () => { void fetchAvailabilityRef.current(); };
    run();

    availabilityIntervalRef.current = setInterval(run, 5000);

    const onFocus = () => run();
    window.addEventListener('focus', onFocus);

    return () => {
      if (availabilityIntervalRef.current) {
        clearInterval(availabilityIntervalRef.current);
        availabilityIntervalRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
    };
  }, [user, currentPage, shifts.length, employees.length, shifts.map(s => s.id).join(','), employees.map(e => e.id).join(',')]);

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    if (userData.role === 'Manager' || userData.userType === 'Manager') {
      setCurrentPage('schedule');
      // Availability maps reset so manager-summary reloads fresh from Access
      setShiftAvailabilityMap(new Map());
      setEmployeeAvailabilityCount(new Map());
      setEmployeeAvailabilityMap(new Map());
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

  const refreshShiftsFromServer = useCallback(async () => {
    const weekParam = formatWeekStartParam(weekMonday);
    const response = await fetch(`/api/shifts?weekStart=${weekParam}`, {
      credentials: 'include',
      cache: 'no-cache',
    });
    if (!response.ok) return;
    const data = await response.json();
    const mappedShifts: Shift[] = (Array.isArray(data) ? data : []).map(
      (shift: Record<string, unknown>) => mapApiShiftToShift(shift)
    );
    setShifts(mappedShifts);
  }, [weekMonday]);

  const handlePublishSchedule = async () => {
    setPublishingSchedule(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      const weekParam = formatWeekStartParam(weekMonday);
      const res = await fetch(`/api/schedule/publish?weekStart=${weekParam}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(
          (err as { message?: string }).message || 'פרסום הלוח נכשל',
          'error'
        );
        return;
      }
      setSchedulePublished(true);
      notify('הלוח פורסם לעובדים — הם יראו את המשמרות בפורטל', 'success');
    } catch {
      notify('שגיאת רשת בפרסום הלוח', 'error');
    } finally {
      setPublishingSchedule(false);
    }
  };

  const persistAssignmentToApi = async (
    shiftId: string,
    employeeId: string | null
  ): Promise<{ ok: boolean; message?: string }> => {
    const backendShiftId = parseInt(shiftId, 10);
    const backendEmployeeId = employeeId != null ? parseInt(employeeId, 10) : null;
    try {
      const response = await fetch(`/api/shifts/${backendShiftId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ employeeId: backendEmployeeId }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const serverMsg = (errorData as { message?: string }).message || '';
        const isMaxShifts =
          serverMsg.includes('maximum') ||
          serverMsg.includes('Max shifts') ||
          (errorData as { error?: string }).error === 'Max shifts exceeded';
        return {
          ok: false,
          message: isMaxShifts
            ? `לא ניתן לשבץ — מקסימום ${MAX_SHIFTS_PER_EMPLOYEE_WEEK} משמרות בשבוע לעובד/ת (מגבלה חוקית).`
            : serverMsg || 'שמירת השיבוץ נכשלה. נסה שוב.',
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: 'Network error while saving assignment.' };
    }
  };

  const executeAssignment = async (shiftId: string, employeeId: string) => {
    const limitCheck = canAssignEmployeeToShift(shifts, employeeId, shiftId);
    if (!limitCheck.ok) {
      const emp = employees.find((e) => e.id === employeeId);
      notify(
        limitCheck.message ||
          `${emp?.name ?? 'העובד/ת'} כבר משובץ/ת ל-${MAX_SHIFTS_PER_EMPLOYEE_WEEK} משמרות השבוע.`,
        'error'
      );
      return;
    }

    setShifts(prev =>
      prev.map(s => (s.id === shiftId ? { ...s, assignedEmployeeId: employeeId } : s))
    );

    const result = await persistAssignmentToApi(shiftId, employeeId);
    if (!result.ok) {
      setShifts(prev =>
        prev.map(s => (s.id === shiftId ? { ...s, assignedEmployeeId: null } : s))
      );
      notify(result.message || 'שמירת השיבוץ נכשלה', 'error');
      return;
    }

  };

  const handleProductivityWarningCancel = () => {
    setProductivityWarning(null);
    setPendingAssignment(null);
  };

  const handleProductivityWarningProceed = async () => {
    if (!pendingAssignment) return;
    const { shiftId, employeeId } = pendingAssignment;
    setProductivityWarning(null);
    setPendingAssignment(null);
    await executeAssignment(shiftId, employeeId);
  };

  // ─── سحب عامل وإفلاته على مناوبة: التحقق من التوفر ثم الإنتاجية ثم الحفظ في API ───
  const handleDrop = async (e: React.DragEvent, shiftId: string) => {
    e.preventDefault();
    const employeeId = e.dataTransfer.getData('employeeId');
    if (!employeeId) return;

    const backendEmployeeId = parseInt(employeeId);
    const shift = shifts.find(s => s.id === shiftId);
    const emp = employees.find(e => e.id === employeeId);
    const availableEmployeeIds = shiftAvailabilityMap.get(shiftId) || [];
    const empSlotMap = employeeAvailabilityMap.get(employeeId) || {};
    const slotKey = shift?.slotNumber ? String(shift.slotNumber) : '';
    const availableBySlot = slotKey ? empSlotMap[slotKey] === true : false;
    const isAvailableForShift =
      availableEmployeeIds.some((id: number | string) => Number(id) === backendEmployeeId) ||
      availableBySlot;

    const hasAvailabilityData =
      availableEmployeeIds.length > 0 || Object.values(empSlotMap).some(v => v === true);

    if (hasAvailabilityData && !isAvailableForShift) {
      const name = emp?.name ?? 'העובד';
      notify(
        `${name} לא סימן/ה זמינות למשמרת זו. העובד/ת יכול/ה לעדכן זמינות בפורטל העובד.`,
        'error'
      );
      return;
    }

    const limitCheck = canAssignEmployeeToShift(shifts, employeeId, shiftId);
    if (!limitCheck.ok) {
      notify(limitCheck.message!, 'error');
      return;
    }

    if (shift && emp) {
      const required = shift.targetSales || 0;
      const projected = calculateProjectedThroughput(emp.productivityScore, shift);
      if (required > 0 && !passesThroughputThreshold(projected, required)) {
        setProductivityWarning({ employee: emp, shift });
        setPendingAssignment({ shiftId, employeeId });
        return;
      }
    }

    await executeAssignment(shiftId, employeeId);
  };

  const getEmployeesAvailableForShift = (shift: Shift): Employee[] => {
    const slotKey = shift.slotNumber ? String(shift.slotNumber) : '';
    const idsFromShift = shiftAvailabilityMap.get(shift.id) || [];

    return employees.filter(emp => {
      const backendId = Number(emp.id);
      const inShiftList = idsFromShift.some(id => Number(id) === backendId);
      const slots = employeeAvailabilityMap.get(emp.id) || {};
      const inSlotMap = slotKey ? slots[slotKey] === true : false;
      return inShiftList || inSlotMap;
    });
  };

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    try {
      const { assignments, emptySlots } = runFastAutoSchedule(
        shifts,
        employees,
        getEmployeesAvailableForShift
      );

      if (emptySlots.length > 0) {
        const lines = emptySlots
          .slice(0, 4)
          .map((e) => `• ${e.reason}`)
          .join('\n');
        const more = emptySlots.length > 4 ? `\n…ועוד ${emptySlots.length - 4}.` : '';
        notify(`לא שובצו ${emptySlots.length} משמרות:\n${lines}${more}`, 'info');
      }

      if (assignments.length === 0) {
        if (emptySlots.length === 0) {
          notify('לא נמצאו עובדים זמינים לשיבוץ. ודא שיש זמינות מתאימה.', 'error');
        }
        return;
      }

      const byShift = new Map(assignments.map((a) => [a.shiftId, a.employeeId]));
      setShifts((prev) =>
        prev.map((s) =>
          byShift.has(s.id) ? { ...s, assignedEmployeeId: byShift.get(s.id)! } : s
        )
      );

      const results = await Promise.all(
        assignments.map(async ({ shiftId, employeeId }) => {
          const result = await persistAssignmentToApi(shiftId, employeeId);
          return { shiftId, employeeId, ...result };
        })
      );

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        const failedIds = new Set(failed.map((f) => f.shiftId));
        setShifts((prev) =>
          prev.map((s) =>
            failedIds.has(s.id) ? { ...s, assignedEmployeeId: null } : s
          )
        );
        void refreshShiftsFromServer();
        notify(
          `נשמרו ${results.length - failed.length} שיבוצים. ${failed.length} נכשלו.`,
          'error'
        );
      } else {
        notify(`שיבוץ אוטומטי: נשמרו ${results.length} משמרות`, 'success');
      }
    } catch (error) {
      console.error('Auto schedule error:', error);
      notify('שגיאה ביצירת סידור עבודה אוטומטי', 'error');
      void refreshShiftsFromServer();
    } finally {
      setIsAutoFilling(false);
    }
  };

  const runScheduleReport = () => {
    startTransition(() => setReportOpen(true));
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
        totalExpectedSales += calculateProjectedThroughput(employee.productivityScore, shift);
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
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    try {
      const result = pickBestEmployeeForShift(
        shift,
        shifts,
        employees,
        getEmployeesAvailableForShift
      );

      if (!result.ok) {
        notify(result.reason, 'error');
        return;
      }

      const { employee: emp, belowThroughputThreshold } = result;

      if (belowThroughputThreshold) {
        setProductivityWarning({ employee: emp, shift });
        setPendingAssignment({ shiftId: shift.id, employeeId: emp.id });
        notify(
          `${emp.name} — תפוקה מתחת ליעד. אשר/י שיבוץ או בחר/י עובד/ת אחר/ת.`,
          'info'
        );
        return;
      }

      await executeAssignment(shift.id, emp.id);
      notify(`הצעה חכמה: ${emp.name} שובץ/ה למשמרת`, 'success');
    } catch (err) {
      console.error('Smart suggestion error:', err);
      notify('שגיאה בהצעה החכמה', 'error');
    } finally {
      setSuggestionLoading(null);
    }
  };

  const removeAssignment = async (shiftId: string) => {
    const previous = shifts.find((s) => s.id === shiftId)?.assignedEmployeeId ?? null;
    setShifts((prev) =>
      prev.map((s) => (s.id === shiftId ? { ...s, assignedEmployeeId: null } : s))
    );
    const result = await persistAssignmentToApi(shiftId, null);
    if (!result.ok) {
      setShifts((prev) =>
        prev.map((s) =>
          s.id === shiftId ? { ...s, assignedEmployeeId: previous } : s
        )
      );
      notify(result.message || 'הסרת השיבוץ נכשלה', 'error');
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
      <BackgroundParticles />
      
      {(user.role === 'Manager' || user.userType === 'Manager') && (
      <nav className="bg-white/95 backdrop-blur-xl border-b border-rose-200/60 shadow-sm px-4 sm:px-6 py-3 sticky top-0 z-50 dir-rtl">
        <div className="max-w-7xl mx-auto flex items-center gap-3 w-full">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3 min-w-0 shrink-0">
            <Logo size="small" showText={false} />
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">
                  Shiftly
                </span>
                <span className="hidden sm:inline-block text-[10px] font-semibold text-slate-500 tracking-wider">
                  שיבוץ חכם
                </span>
              </div>
              {(user.role === 'Manager' || user.userType === 'Manager') && (
                <span className="text-[9px] text-rose-500 font-semibold mt-0.5">
                  <i className="fas fa-user-shield ml-1"></i>לוח בקרה — מנהל
                </span>
              )}
              {(user.role === 'Employee' || user.userType === 'Employee') && (
                <span className="text-[9px] text-purple-500 font-semibold mt-0.5">
                  <i className="fas fa-user mr-1"></i>Employee Portal
                </span>
              )}
            </div>
          </div>

          {/* Navigation + tools (center) */}
          <div className="flex flex-1 flex-wrap items-center justify-center gap-2 min-w-0">
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
                <span>לוח שיבוץ</span>
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
                  <span>עובדים</span>
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
                  <span>משתמשים</span>
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
                  לא מחובר
                </span>
              )}
              {backendStatus && !backendError && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <i className="fas fa-check-circle mr-1"></i>
                  מחובר
                </span>
              )}
            </div>

            {/* Manager Tools */}
            {(user.role === 'Manager' || user.userType === 'Manager') && (
              <div className="flex items-center gap-2 flex-wrap">
                <button 
                    onClick={handleAutoFill}
                    disabled={isAutoFilling}
                    className="flex items-center gap-2 bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 hover:from-rose-400 hover:via-purple-400 hover:to-cyan-400 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-[transform,opacity,box-shadow] duration-150 shadow-md shadow-rose-500/25 hover:shadow-lg disabled:opacity-50 relative overflow-hidden group active:scale-[0.98]"
                    title="שיבוץ אוטומטי"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>
                  <span className="relative z-10 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <i className={`fas ${isAutoFilling ? 'fa-spinner fa-spin' : 'fa-magic'} text-sm`}></i>
                    </span>
                    <span className="hidden sm:inline">שיבוץ אוטומטי</span>
                  </span>
                </button>
                <button 
                    type="button"
                    onClick={runScheduleReport}
                    className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-[transform,opacity,box-shadow] duration-150 shadow-md shadow-violet-500/30 hover:shadow-lg hover:shadow-violet-500/40 active:scale-[0.98]"
                    title="דוח שבועי"
                >
                    <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                      <i className="fas fa-chart-pie text-sm" aria-hidden />
                    </span>
                    <span className="hidden sm:inline whitespace-nowrap">דוח שבועי</span>
                </button>
                <button
                    type="button"
                    onClick={handlePublishSchedule}
                    disabled={publishingSchedule || schedulePublished}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-[transform,opacity,box-shadow] duration-150 shadow-md active:scale-[0.98] disabled:cursor-not-allowed ${
                      schedulePublished
                        ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-300 shadow-emerald-500/10'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/40 disabled:opacity-60'
                    }`}
                    title={schedulePublished ? 'הלוח כבר פורסם לעובדים' : 'פרסום הלוח לעובדים'}
                >
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      schedulePublished ? 'bg-emerald-200/80' : 'bg-white/20'
                    }`}
                  >
                    <i
                      className={`fas text-sm ${
                        publishingSchedule
                          ? 'fa-spinner fa-spin'
                          : schedulePublished
                            ? 'fa-circle-check'
                            : 'fa-paper-plane'
                      }`}
                      aria-hidden
                    />
                  </span>
                  <span className="hidden sm:inline whitespace-nowrap">
                    {publishingSchedule
                      ? 'מפרסם...'
                      : schedulePublished
                        ? 'פורסם לעובדים'
                        : 'פרסום לעובדים'}
                  </span>
                </button>
              </div>
            )}

            {/* User Info */}
            <div className="flex items-center gap-2 pe-3 border-e border-rose-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-700">{user.fullName}</p>
                <p className="text-[10px] text-slate-500">{formatUserRoleHe(user.role || user.userType)}</p>
              </div>
            </div>
          </div>
          </div>

          {/* יציאה — בקצה העמוד */}
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-[transform,opacity,box-shadow] duration-150 shadow-md hover:shadow-lg active:scale-95"
            title="יציאה"
          >
            <i className="fas fa-sign-out-alt" aria-hidden />
            <span className="hidden sm:inline">יציאה</span>
          </button>
        </div>
      </nav>
      )}

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
        <main className="relative z-10 max-w-[90rem] mx-auto w-full px-3 lg:px-6 py-5 flex flex-col lg:flex-row gap-5 items-start dir-rtl">
        <div className="flex-1 min-w-0 text-right">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <WeekNavigator weekMonday={weekMonday} onChange={setWeekMonday} />
            {schedulePublished && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full dir-rtl">
                <i className="fas fa-check-circle ml-1" />
                הלוח פורסם לעובדים
              </span>
            )}
          </div>
          <KPIBanner kpis={kpis} />

          {reportOpen && (
            <ScheduleReportPanel
              report={scheduleReportData}
              onClose={() => setReportOpen(false)}
            />
          )}

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

          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-rose-200/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-rose-100 bg-rose-50/40">
                <h2 className="text-base font-black text-slate-800 dir-rtl text-right">
                  לוח שיבוץ שבועי — <span className="text-rose-600">Shiftly</span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5 dir-rtl text-right">
                  גרור עובד מהרשימה או השתמש בשיבוץ אוטומטי
                </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[640px] table-fixed">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2.5 text-[10px] font-bold text-slate-600 uppercase border-r border-rose-100 w-24">יום</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-slate-600 uppercase w-[42%]">בוקר 09–15</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-slate-600 uppercase w-[42%]">ערב 15–21</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {loadingShifts ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-12 text-center">
                        <i className="fas fa-spinner fa-spin text-rose-500 text-2xl mb-2"></i>
                        <p className="text-slate-600 font-bold">טוען משמרות...</p>
                      </td>
                    </tr>
                  ) : shifts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-12 text-center">
                        <i className="fas fa-calendar-times text-slate-400 text-2xl mb-2"></i>
                        <p className="text-slate-600 font-bold">לא נמצאו משמרות</p>
                        <p className="text-slate-500 text-sm mt-1">משמרות יופיעו כאן לאחר יצירתן במערכת</p>
                      </td>
                    </tr>
                  ) : (
                    DAYS.map(day => {
                      const morningShift = getShiftForDaySlot(shiftsBySlot, day, 'Morning');
                      const afternoonShift = getShiftForDaySlot(shiftsBySlot, day, 'Afternoon');
                      
                      return (
                        <tr key={day} className="group">
                          <td className="px-3 py-3 text-sm font-bold text-slate-800 border-r border-rose-100 bg-rose-50/40 align-middle text-center">
                            {formatDayHe(day)}
                          </td>
                          <td className="px-2 py-2 align-top">
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
                              <div className="border border-dashed border-rose-200 rounded-lg p-3 text-center text-slate-400 text-[10px]">
                                אין משמרת
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
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
                                <p className="text-[10px]">אין משמרת</p>
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
          employeeAvailabilityMap={employeeAvailabilityMap}
          employeeAssignmentCount={employeeAssignmentCount}
          loading={loadingEmployees}
        />
      </main>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .dir-rtl { direction: rtl; }
      `}} />

      <ProductivityWarningModal
        context={productivityWarning}
        onCancel={handleProductivityWarningCancel}
        onProceed={handleProductivityWarningProceed}
      />
      <AppToast />
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
        const normScore = normalizeProductivityScore(assignedEmployee.productivityScore);
        const scoreColor = normScore >= 8.5 ? 'text-green-600 bg-green-50' : 
                          normScore >= 7 ? 'text-orange-600 bg-orange-50' : 'text-red-600 bg-red-50';

        return (
            <div className="relative group bg-white border border-rose-200 rounded-lg px-2.5 py-2 flex items-center gap-2 shadow-sm">
                <img src={assignedEmployee.avatar} className="w-9 h-9 rounded-full border border-rose-200 shrink-0" alt="" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{assignedEmployee.name}</p>
                    <p className="text-[10px] text-slate-500">יעד ${shift.targetSales.toLocaleString()}</p>
                </div>
                <div className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${scoreColor}`}>
                    {normScore.toFixed(1)}/10
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

        // Filter available employees - ensure ID matching works correctly
        const availableEmployees = allEmployees.filter(emp => {
          const empIdNum = Number(emp.id);
          const isAvailable = availableEmployeeIds.some((id: number | string) => {
            const idNum = Number(id);
            return !isNaN(empIdNum) && !isNaN(idNum) && empIdNum === idNum;
          });
          return isAvailable;
        });
        
        // Debug logging
        if (availableEmployeeIds.length > 0 && availableEmployees.length === 0) {
          console.warn(`Manager: ShiftSlot - Available IDs don't match employees`, {
            shiftId: shift.id,
            availableEmployeeIds,
            allEmployeeIds: allEmployees.map(e => Number(e.id)),
            employeeNames: allEmployees.map(e => `${e.name} (ID:${e.id})`)
          });
        }

        return (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={onDropHandler}
            className="border border-dashed border-rose-200 rounded-lg px-2 py-2.5 flex flex-col items-center justify-center text-slate-500 hover:border-rose-300 hover:bg-rose-50/80 transition-colors group min-h-[4.5rem] relative cursor-pointer bg-white/80"
        >
            {isLoading ? (
                <div className="flex items-center gap-1.5 text-rose-500">
                    <i className="fas fa-circle-notch fa-spin text-xs"></i>
                    <span className="text-[10px] font-medium">מחשב...</span>
                </div>
            ) : (
                <>
                    {availableEmployees.length > 0 ? (
                        <>
                            <span className="text-[10px] font-bold text-slate-600 dir-rtl text-center leading-tight">
                                גרור עובד לכאן
                            </span>
                            <span className="text-[9px] text-green-600 font-semibold mt-1 dir-rtl">
                                {availableEmployees.length} זמינים
                            </span>
                            <div className="flex flex-wrap justify-center gap-0.5 mt-1 max-w-full">
                                {availableEmployees.slice(0, 4).map((emp) => (
                                    <span
                                        key={emp.id}
                                        className="px-1.5 py-0.5 rounded bg-green-50 text-green-800 text-[9px] font-medium border border-green-200"
                                        title={`${emp.name} — ${normalizeProductivityScore(emp.productivityScore).toFixed(1)}/10`}
                                    >
                                        {emp.name.split(' ')[0]}
                                    </span>
                                ))}
                                {availableEmployees.length > 4 && (
                                    <span className="text-[9px] text-green-600">+{availableEmployees.length - 4}</span>
                                )}
                            </div>
                        </>
                    ) : (
                        <span className="text-[10px] text-slate-400 dir-rtl text-center leading-snug px-1">
                            אין זמינות למשמרת זו
                        </span>
                    )}
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSuggest(); }}
                        className="absolute top-1 left-1 p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                        title="הצעה חכמה — עובד זמין עם התפוקה הגבוהה ביותר"
                    >
                        <i className="fas fa-wand-magic-sparkles"></i>
                    </button>
                </>
            )}
        </div>
    );
}

export default App;

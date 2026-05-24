import { DAYS } from '../constants';
import { Employee, Shift } from '../types';
import {
  WEEKLY_SHIFT_SLOT_COUNT,
  buildShiftsBySlotMap,
  isShiftAssigned,
  slotToDayAndType,
} from './week';
import {
  STANDARD_SHIFT_HOURS,
  calculateProjectedThroughput,
  passesThroughputThreshold,
  normalizeProductivityScore,
} from './throughput';

export type ShiftStatus = 'filled-ok' | 'filled-risk' | 'empty' | 'no-workers';
export type HealthStatus = 'good' | 'attention' | 'critical';
export type ActionPriority = 'do-first' | 'consider' | 'all-set';

export interface ScheduleReportShiftCell {
  slotNumber: number;
  day: string;
  type: string;
  timeRange: string;
  status: ShiftStatus;
  employeeName?: string;
  targetSales: number;
  projectedSales?: number;
  availableCount: number;
}

export interface ScheduleReportDayRow {
  day: string;
  morning: ScheduleReportShiftCell;
  afternoon: ScheduleReportShiftCell;
}

export interface ScheduleReportAction {
  priority: ActionPriority;
  message: string;
}

export interface ScheduleReportEmployeeRow {
  employeeId: string;
  name: string;
  shiftCount: number;
  hours: number;
  laborCost: number;
  projectedSales: number;
  productivityScore: number;
}

export interface ScheduleReport {
  generatedAt: string;
  healthStatus: HealthStatus;
  executiveSummary: string[];
  coverage: {
    filled: number;
    total: number;
    percentage: number;
  };
  totalTargetSales: number;
  totalProjectedSales: number;
  totalLaborCost: number;
  atRiskCount: number;
  noAvailabilityCount: number;
  openShiftCount: number;
  days: ScheduleReportDayRow[];
  atRisk: { day: string; type: string; employeeName: string; shortfall: number }[];
  actions: ScheduleReportAction[];
  employees: ScheduleReportEmployeeRow[];
  openShifts: { day: string; type: string; targetSales: number }[];
}

interface ReportIndexes {
  employeeById: Map<string, Employee>;
  availabilityBySlot: Map<number, number>;
  availabilityByEmployee: Map<string, Record<string, boolean>>;
}

function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function buildReportIndexes(
  employees: Employee[],
  shiftAvailabilityMap: Map<string, number[]>,
  employeeAvailabilityMap: Map<string, Record<string, boolean>>,
  shiftsBySlot: Map<number, Shift>
): ReportIndexes {
  const employeeById = new Map<string, Employee>();
  employees.forEach(e => employeeById.set(e.id, e));

  const availabilityBySlot = new Map<number, number>();
  for (let slot = 1; slot <= WEEKLY_SHIFT_SLOT_COUNT; slot++) {
    const shift = shiftsBySlot.get(slot);
    const ids = shift ? shiftAvailabilityMap.get(shift.id) ?? [] : [];
    availabilityBySlot.set(slot, ids.length);
  }

  return {
    employeeById,
    availabilityBySlot,
    availabilityByEmployee: employeeAvailabilityMap,
  };
}

function countAvailableForSlot(
  slot: number,
  indexes: ReportIndexes,
  shiftsBySlot: Map<number, Shift>
): number {
  const shift = shiftsBySlot.get(slot);
  if (!shift) {
    return indexes.availabilityBySlot.get(slot) ?? 0;
  }

  const fromShiftMap = indexes.availabilityBySlot.get(slot) ?? 0;
  if (fromShiftMap > 0) return fromShiftMap;

  let count = 0;
  const slotKey = String(slot);
  indexes.availabilityByEmployee.forEach(slots => {
    if (slots?.[slotKey] === true) count++;
  });
  return count;
}

function buildShiftCell(
  slot: number,
  shift: Shift | undefined,
  indexes: ReportIndexes,
  shiftsBySlot: Map<number, Shift>
): ScheduleReportShiftCell {
  const { day, type } = slotToDayAndType(slot);
  const availableCount = countAvailableForSlot(slot, indexes, shiftsBySlot);
  const targetSales = shift?.targetSales ?? (type === 'Morning' ? 2500 : 3500);
  const timeRange =
    type === 'Morning' ? '09:00–15:00' : '15:00–21:00';

  if (!shift || !isShiftAssigned(shift)) {
    return {
      slotNumber: slot,
      day,
      type,
      timeRange,
      status: availableCount === 0 ? 'no-workers' : 'empty',
      targetSales,
      availableCount,
    };
  }

  const employee = indexes.employeeById.get(shift.assignedEmployeeId!);
  const projectedSales = employee
    ? calculateProjectedThroughput(employee.productivityScore, shift)
    : 0;
  const ok = passesThroughputThreshold(projectedSales, targetSales);

  return {
    slotNumber: slot,
    day,
    type,
    timeRange,
    status: ok ? 'filled-ok' : 'filled-risk',
    employeeName: employee?.name ?? 'Assigned',
    targetSales,
    projectedSales,
    availableCount,
  };
}

function deriveHealthStatus(
  coveragePct: number,
  atRiskCount: number,
  openShiftCount: number,
  noAvailabilityCount: number
): HealthStatus {
  if (openShiftCount >= 5 || coveragePct < 50) return 'critical';
  if (atRiskCount > 0 || openShiftCount > 0 || noAvailabilityCount > 0 || coveragePct < 85) {
    return 'attention';
  }
  return 'good';
}

function buildExecutiveSummary(
  coverage: ScheduleReport['coverage'],
  totalTargetSales: number,
  totalProjectedSales: number,
  totalLaborCost: number,
  atRiskCount: number,
  openShiftCount: number,
  noAvailabilityCount: number
): string[] {
  const bullets: string[] = [];
  bullets.push(
    `${coverage.filled} מתוך ${coverage.total} משמרות עם עובד משובץ (${coverage.percentage}% כיסוי).`
  );
  if (openShiftCount > 0) {
    bullets.push(`עדיין חסרים ${openShiftCount} משמרות ללא שיבוץ.`);
  } else {
    bullets.push('כל המשבצות השבועיות משובצות.');
  }
  bullets.push(
    `יעד מכירות שבועי: ${formatCurrency(totalTargetSales)}; צפי מהצוות: ${formatCurrency(totalProjectedSales)}.`
  );
  bullets.push(`הערכת שכר למשמרות משובצות: ${formatCurrency(totalLaborCost)}.`);
  if (atRiskCount > 0) {
    bullets.push(`${atRiskCount} שיבוץ/ים עלולים לא לעמוד ביעד (כלל 90%).`);
  }
  if (noAvailabilityCount > 0) {
    bullets.push(`${noAvailabilityCount} משבצות ללא אף עובד שסימן זמינות.`);
  }
  return bullets;
}

export function buildScheduleReport(
  shifts: Shift[],
  employees: Employee[],
  shiftAvailabilityMap: Map<string, number[]>,
  employeeAvailabilityMap: Map<string, Record<string, boolean>>
): ScheduleReport {
  const shiftsBySlot = buildShiftsBySlotMap(shifts);
  const indexes = buildReportIndexes(
    employees,
    shiftAvailabilityMap,
    employeeAvailabilityMap,
    shiftsBySlot
  );

  let filled = 0;
  let totalTargetSales = 0;
  let totalProjectedSales = 0;
  let totalLaborCost = 0;
  let atRiskCount = 0;
  let noAvailabilityCount = 0;
  let openShiftCount = 0;

  const atRisk: ScheduleReport['atRisk'] = [];
  const openShifts: ScheduleReport['openShifts'] = [];
  const days: ScheduleReportDayRow[] = [];
  const employeeStats = new Map<string, ScheduleReportEmployeeRow>();

  for (const day of DAYS) {
    const dayIndex = DAYS.indexOf(day);
    const morningSlot = dayIndex * 2 + 1;
    const afternoonSlot = dayIndex * 2 + 2;
    const morning = buildShiftCell(morningSlot, shiftsBySlot.get(morningSlot), indexes, shiftsBySlot);
    const afternoon = buildShiftCell(
      afternoonSlot,
      shiftsBySlot.get(afternoonSlot),
      indexes,
      shiftsBySlot
    );
    days.push({ day, morning, afternoon });

    for (const cell of [morning, afternoon]) {
      totalTargetSales += cell.targetSales;
      if (cell.status === 'empty') openShiftCount++;
      if (cell.status === 'no-workers') noAvailabilityCount++;
      if (cell.status === 'filled-ok' || cell.status === 'filled-risk') {
        filled++;
        if (cell.status === 'filled-risk' && cell.employeeName) {
          atRiskCount++;
          const shortfall = cell.targetSales * 0.9 - (cell.projectedSales ?? 0);
          atRisk.push({
            day: cell.day,
            type: cell.type,
            employeeName: cell.employeeName,
            shortfall: Math.max(0, Math.round(shortfall)),
          });
        }
        if (cell.projectedSales) totalProjectedSales += cell.projectedSales;
      } else if (cell.status === 'empty' || cell.status === 'no-workers') {
        openShifts.push({ day: cell.day, type: cell.type, targetSales: cell.targetSales });
      }
    }
  }

  for (let slot = 1; slot <= WEEKLY_SHIFT_SLOT_COUNT; slot++) {
    const shift = shiftsBySlot.get(slot);
    if (!isShiftAssigned(shift)) continue;
    const emp = indexes.employeeById.get(shift!.assignedEmployeeId!);
    if (!emp) continue;
    const projected = calculateProjectedThroughput(emp.productivityScore, shift!);
    const labor = emp.hourlyRate * STANDARD_SHIFT_HOURS;
    totalLaborCost += labor;

    const existing = employeeStats.get(emp.id);
    if (existing) {
      existing.shiftCount++;
      existing.hours += STANDARD_SHIFT_HOURS;
      existing.laborCost += labor;
      existing.projectedSales += projected;
    } else {
      employeeStats.set(emp.id, {
        employeeId: emp.id,
        name: emp.name,
        shiftCount: 1,
        hours: STANDARD_SHIFT_HOURS,
        laborCost: labor,
        projectedSales: projected,
        productivityScore: normalizeProductivityScore(emp.productivityScore),
      });
    }
  }

  const coverage = {
    filled,
    total: WEEKLY_SHIFT_SLOT_COUNT,
    percentage: Math.round((filled / WEEKLY_SHIFT_SLOT_COUNT) * 100),
  };

  const healthStatus = deriveHealthStatus(
    coverage.percentage,
    atRiskCount,
    openShiftCount,
    noAvailabilityCount
  );

  const actions: ScheduleReportAction[] = [];
  if (openShiftCount > 0) {
    actions.push({
      priority: 'do-first',
      message: `שבץ עובדים ל-${openShiftCount} משמרות פתוחות.`,
    });
  }
  if (noAvailabilityCount > 0) {
    actions.push({
      priority: 'do-first',
      message: `בקשי מהעובדים לעדכן זמינות ב-${noAvailabilityCount} משבצות ללא מתנדבים.`,
    });
  }
  if (atRiskCount > 0) {
    actions.push({
      priority: 'consider',
      message: `בדקי ${atRiskCount} שיבוצים בסיכון שלא יעמדו ביעד המכירות.`,
    });
  }
  if (actions.length === 0) {
    actions.push({
      priority: 'all-set',
      message: 'הלוח נראה מאוזן — אין פעולות דחופות.',
    });
  }

  const executiveSummary = buildExecutiveSummary(
    coverage,
    totalTargetSales,
    totalProjectedSales,
    totalLaborCost,
    atRiskCount,
    openShiftCount,
    noAvailabilityCount
  );

  return {
    generatedAt: new Date().toLocaleString('he-IL'),
    healthStatus,
    executiveSummary,
    coverage,
    totalTargetSales,
    totalProjectedSales,
    totalLaborCost,
    atRiskCount,
    noAvailabilityCount,
    openShiftCount,
    days,
    atRisk,
    actions,
    employees: Array.from(employeeStats.values()).sort((a, b) => b.shiftCount - a.shiftCount),
    openShifts,
  };
}

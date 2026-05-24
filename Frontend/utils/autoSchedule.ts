import { Employee, Shift } from '../types';
import {
  calculateProjectedThroughput,
  normalizeProductivityScore,
  passesThroughputThreshold,
} from './throughput';
import {
  MAX_SHIFTS_PER_EMPLOYEE_WEEK,
  countEmployeeAssignedShifts,
} from './scheduleLimits';
import { formatDayHe, formatShiftTypeHe } from './labelsHe';

export type AutoScheduleAssignment = { shiftId: string; employeeId: string };
export type AutoScheduleEmptySlot = { shift: Shift; reason: string };

export type GetAvailableForShift = (shift: Shift) => Employee[];

/**
 * שיבוץ אוטומטי — עדיפות לעובדים עם תפוקה גבוהה (עד 6 משמרות לכל עובד),
 * ואז מעבר לעובד הבא בתפוקה. אם אין מי שעובר סף — משבץ את המתאים ביותר בכל זאת.
 */
export function runFastAutoSchedule(
  shiftsToFill: Shift[],
  roster: Employee[],
  getAvailableForShift: GetAvailableForShift
): { assignments: AutoScheduleAssignment[]; emptySlots: AutoScheduleEmptySlot[] } {
  const employeeShiftCount: Record<string, number> = {};
  roster.forEach((emp) => {
    employeeShiftCount[emp.id] = countEmployeeAssignedShifts(shiftsToFill, emp.id);
  });

  const sortedShifts = [...shiftsToFill]
    .filter((s) => !s.assignedEmployeeId)
    .sort((a, b) => b.targetSales - a.targetSales);

  const assignments: AutoScheduleAssignment[] = [];
  const emptySlots: AutoScheduleEmptySlot[] = [];

  const underWeeklyLimit = (list: Employee[]) =>
    list.filter((emp) => (employeeShiftCount[emp.id] ?? 0) < MAX_SHIFTS_PER_EMPLOYEE_WEEK);

  const pickEmployee = (
    candidates: Employee[],
    shift: Shift,
    strictThroughput: boolean
  ): Employee | null => {
    if (candidates.length === 0) return null;

    const required = shift.targetSales || 0;

    const ranked = candidates
      .map((emp) => {
        const projected = calculateProjectedThroughput(emp.productivityScore, shift);
        const meetsThroughput =
          required <= 0 || passesThroughputThreshold(projected, required);
        return {
          emp,
          productivity: normalizeProductivityScore(emp.productivityScore),
          projected,
          meetsThroughput,
        };
      })
      .filter((x) => !strictThroughput || x.meetsThroughput)
      .sort((a, b) => {
        if (b.productivity !== a.productivity) {
          return b.productivity - a.productivity;
        }
        return b.projected - a.projected;
      });

    return ranked[0]?.emp ?? null;
  };

  for (const shift of sortedShifts) {
    const pool = getAvailableForShift(shift).filter((emp) =>
      roster.some((e) => e.id === emp.id)
    );

    if (pool.length === 0) {
      emptySlots.push({
        shift,
        reason: `${formatDayHe(shift.day)} ${formatShiftTypeHe(shift.type)} (אין זמינות)`,
      });
      continue;
    }

    const underLimit = underWeeklyLimit(pool);
    if (underLimit.length === 0) {
      emptySlots.push({
        shift,
        reason: `${formatDayHe(shift.day)} ${formatShiftTypeHe(shift.type)} (מקס. ${MAX_SHIFTS_PER_EMPLOYEE_WEEK} משמרות/שבוע)`,
      });
      continue;
    }

    let chosen = pickEmployee(underLimit, shift, true);
    if (!chosen) {
      chosen = pickEmployee(underLimit, shift, false);
    }

    if (!chosen) {
      emptySlots.push({
        shift,
        reason: `${formatDayHe(shift.day)} ${formatShiftTypeHe(shift.type)}`,
      });
      continue;
    }

    assignments.push({ shiftId: shift.id, employeeId: chosen.id });
    employeeShiftCount[chosen.id] = (employeeShiftCount[chosen.id] ?? 0) + 1;
  }

  return { assignments, emptySlots };
}

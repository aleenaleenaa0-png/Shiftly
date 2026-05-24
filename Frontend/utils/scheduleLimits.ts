import { MAX_SHIFTS_PER_EMPLOYEE_WEEK } from '../constants';
import { Shift } from '../types';

export { MAX_SHIFTS_PER_EMPLOYEE_WEEK };

export function countEmployeeAssignedShifts(
  shifts: Pick<Shift, 'assignedEmployeeId'>[],
  employeeId: string
): number {
  return shifts.filter((s) => s.assignedEmployeeId === employeeId).length;
}

export function buildEmployeeAssignmentCounts(
  shifts: Pick<Shift, 'assignedEmployeeId'>[],
  employeeIds: string[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const id of employeeIds) {
    map.set(id, countEmployeeAssignedShifts(shifts, id));
  }
  return map;
}

export function canAssignEmployeeToShift(
  shifts: Pick<Shift, 'id' | 'assignedEmployeeId'>[],
  employeeId: string,
  targetShiftId: string
): { ok: boolean; count: number; message?: string } {
  const target = shifts.find((s) => s.id === targetShiftId);
  if (target?.assignedEmployeeId === employeeId) {
    return { ok: true, count: countEmployeeAssignedShifts(shifts, employeeId) };
  }

  const count = countEmployeeAssignedShifts(shifts, employeeId);
  if (count >= MAX_SHIFTS_PER_EMPLOYEE_WEEK) {
    return {
      ok: false,
      count,
      message: `לא ניתן לשבץ — מקסימום ${MAX_SHIFTS_PER_EMPLOYEE_WEEK} משמרות בשבוע לעובד/ת (מגבלה חוקית).`,
    };
  }
  return { ok: true, count };
}

export function isAtWeeklyShiftLimit(
  shifts: Pick<Shift, 'assignedEmployeeId'>[],
  employeeId: string
): boolean {
  return countEmployeeAssignedShifts(shifts, employeeId) >= MAX_SHIFTS_PER_EMPLOYEE_WEEK;
}

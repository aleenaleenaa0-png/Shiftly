import { DAYS } from '../constants';
import { Shift } from '../types';
export { formatDayHe, formatShiftTypeHe, formatRoleHe, formatUserRoleHe } from './labelsHe';

export const WEEKLY_SHIFT_SLOT_COUNT = 14;

export function getWeekMonday(from: Date = new Date()): Date {
  const today = new Date(from);
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Date-only week key for API queries (avoids UTC timezone drift). */
export function formatWeekStartParam(monday: Date = getWeekMonday()): string {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addWeeks(monday: Date, weeks: number): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + weeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatWeekLabel(monday: Date): string {
  const sunday = addWeeks(monday, 1);
  sunday.setDate(sunday.getDate() - 1);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const start = monday.toLocaleDateString('he-IL', opts);
  const end = sunday.toLocaleDateString('he-IL', { ...opts, year: 'numeric' });
  return `${start} – ${end}`;
}

export function isCurrentWeek(monday: Date): boolean {
  return formatWeekStartParam(monday) === formatWeekStartParam(getWeekMonday());
}

export function slotToDayAndType(slotNumber: number): {
  day: string;
  type: 'Morning' | 'Afternoon';
} {
  const slot = Math.max(1, Math.min(WEEKLY_SHIFT_SLOT_COUNT, slotNumber));
  const dayIndex = Math.floor((slot - 1) / 2);
  const isMorning = slot % 2 === 1;
  return {
    day: DAYS[dayIndex] ?? DAYS[0],
    type: isMorning ? 'Morning' : 'Afternoon',
  };
}

export function resolveSlotNumber(raw: Record<string, unknown>): number {
  const explicit = Number(raw.SlotNumber ?? raw.slotNumber ?? 0);
  if (explicit >= 1 && explicit <= WEEKLY_SHIFT_SLOT_COUNT) return explicit;

  const start = raw.StartTime ?? raw.startTime;
  if (start == null) return 0;

  const startDate = typeof start === 'string' ? new Date(start) : (start as Date);
  if (Number.isNaN(startDate.getTime())) return 0;

  const hour = startDate.getHours();
  const isMorning = hour >= 9 && hour < 15;
  const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dayIndex = DAYS.indexOf(dayName);
  if (dayIndex === -1) return 0;

  return dayIndex * 2 + (isMorning ? 1 : 2);
}

export function mapApiShiftToShift(shift: Record<string, unknown>): Shift {
  const slotNumber = resolveSlotNumber(shift);
  const { day, type } =
    slotNumber > 0
      ? slotToDayAndType(slotNumber)
      : { day: 'Monday', type: 'Morning' as const };

  const startTime = new Date(String(shift.StartTime ?? shift.startTime ?? ''));
  const endTime = new Date(String(shift.EndTime ?? shift.endTime ?? ''));

  return {
    id: String(shift.ShiftId ?? shift.shiftId ?? ''),
    slotNumber,
    day,
    startTime: startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }),
    endTime: endTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }),
    type,
    targetSales: Number(shift.RequiredProductivity ?? shift.requiredProductivity ?? 2500),
    assignedEmployeeId:
      shift.EmployeeId != null || shift.employeeId != null
        ? String(shift.EmployeeId ?? shift.employeeId)
        : null,
  };
}

export function buildShiftsBySlotMap(shifts: Shift[]): Map<number, Shift> {
  const map = new Map<number, Shift>();
  for (const shift of shifts) {
    const slot = shift.slotNumber ?? resolveSlotNumber(shift as unknown as Record<string, unknown>);
    if (slot >= 1 && slot <= WEEKLY_SHIFT_SLOT_COUNT) {
      map.set(slot, { ...shift, slotNumber: slot });
    }
  }
  return map;
}

export function isShiftAssigned(shift: Shift | undefined | null): boolean {
  return Boolean(shift?.assignedEmployeeId);
}

export function countWeeklyShiftCoverage(shifts: Shift[]): {
  filled: number;
  total: number;
  percentage: number;
} {
  const bySlot = buildShiftsBySlotMap(shifts);
  let filled = 0;
  for (let slot = 1; slot <= WEEKLY_SHIFT_SLOT_COUNT; slot++) {
    if (isShiftAssigned(bySlot.get(slot))) filled++;
  }
  const total = WEEKLY_SHIFT_SLOT_COUNT;
  return {
    filled,
    total,
    percentage: total > 0 ? Math.round((filled / total) * 100) : 0,
  };
}

export function getShiftForDaySlot(
  shiftsBySlot: Map<number, Shift>,
  day: string,
  type: 'Morning' | 'Afternoon'
): Shift | undefined {
  const dayIndex = DAYS.indexOf(day);
  if (dayIndex === -1) return undefined;
  const slot = dayIndex * 2 + (type === 'Morning' ? 1 : 2);
  return shiftsBySlot.get(slot);
}

import { Shift } from '../types';

/** Standard shift length (matches backend: 09–15 and 15–21). */
export const STANDARD_SHIFT_HOURS = 6;

const TOLERANCE = 0.1;

/** Normalize DB score (0–10) or legacy UI values. */
export function normalizeProductivityScore(score: number): number {
  if (score <= 0) return 0;
  if (score <= 10) return score;
  return Math.min(10, score / 10);
}

export function getShiftDurationHours(shift: Shift): number {
  if (shift.startTime && shift.endTime) {
    const [sh, sm] = shift.startTime.split(':').map(Number);
    const [eh, em] = shift.endTime.split(':').map(Number);
    if (!Number.isNaN(sh) && !Number.isNaN(eh)) {
      const startM = sh * 60 + (sm || 0);
      const endM = eh * 60 + (em || 0);
      const diff = (endM - startM) / 60;
      if (diff > 0) return diff;
    }
  }
  if (shift.type === 'Morning' || shift.type === 'Afternoon') return STANDARD_SHIFT_HOURS;
  return STANDARD_SHIFT_HOURS;
}

/**
 * Projected throughput for the shift:
 * (productivity / 10) × required throughput — equivalent to productivity × hours
 * when required is defined for that shift duration.
 */
export function calculateProjectedThroughput(
  productivityScore: number,
  shift: Shift
): number {
  const score = normalizeProductivityScore(productivityScore);
  const hours = getShiftDurationHours(shift);
  const required = shift.targetSales || 0;
  const ratePerHour = required / (10 * hours);
  return score * hours * ratePerHour;
}

export function getMinimumAcceptableThroughput(required: number): number {
  return required * (1 - TOLERANCE);
}

export function passesThroughputThreshold(
  projected: number,
  required: number
): boolean {
  if (required <= 0) return true;
  return projected >= getMinimumAcceptableThroughput(required);
}

export function formatThroughput(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

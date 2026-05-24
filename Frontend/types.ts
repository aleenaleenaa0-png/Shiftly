/**
 * types.ts — أشكال البيانات في الواجهة (TypeScript)
 * لا تطابق Access حرفياً — App.tsx يحوّل استجابة API إلى هذه الأشكال.
 */

export interface Employee {
  id: string;
  name: string;
  role: 'Manager' | 'Sales Lead' | 'Associate';
  hourlyRate: number;
  productivityScore: number; // 1-100 based on historical sales performance
  avatar: string;
  availability: string[]; // Days of the week e.g. ["Monday", "Tuesday"]
}

export interface Shift {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  type: 'Morning' | 'Afternoon' | 'Evening';
  targetSales: number;
  assignedEmployeeId: string | null;
  slotNumber?: number;
}

export interface ScheduleKPIs {
  totalCost: number;
  totalTargetSales: number;
  projectedSales: number;
  salesPerPayrollDollar: number;
  coveragePercentage: number;
  filledShifts: number;
  totalShifts: number;
}

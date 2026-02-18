
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
}

export interface ScheduleKPIs {
  totalCost: number;
  totalTargetSales: number;
  efficiencyRatio: number; // sales / cost
  coveragePercentage: number;
}

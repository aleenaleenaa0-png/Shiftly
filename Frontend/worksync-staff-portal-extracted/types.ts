
export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
  PREFERRED = 'PREFERRED'
}

export interface DayAvailability {
  date: string; // ISO format
  status: AvailabilityStatus;
  note?: string;
}

export interface Shift {
  id: string;
  workerName: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  role: string;
  date: string;      // ISO format
}

export interface WeeklySchedule {
  weekStart: string;
  shifts: Shift[];
  status: 'Draft' | 'Finalized';
}

export interface User {
  id: string;
  name: string;
  role: 'Worker' | 'Manager';
}

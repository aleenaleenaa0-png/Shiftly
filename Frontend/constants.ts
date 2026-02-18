
import { Employee, Shift } from './types';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const EMPLOYEES: Employee[] = [
  { id: '1', name: 'Jordan Michaels', role: 'Manager', hourlyRate: 45, productivityScore: 95, avatar: 'https://picsum.photos/seed/jordan/100', availability: DAYS },
  { id: '2', name: 'Sarah Jenkins', role: 'Sales Lead', hourlyRate: 32, productivityScore: 88, avatar: 'https://picsum.photos/seed/sarah/100', availability: DAYS },
  { id: '3', name: 'Marcus Miller', role: 'Associate', hourlyRate: 25, productivityScore: 72, avatar: 'https://picsum.photos/seed/marcus/100', availability: ['Monday', 'Wednesday', 'Friday', 'Saturday'] },
  { id: '4', name: 'Leah Rivera', role: 'Associate', hourlyRate: 25, productivityScore: 81, avatar: 'https://picsum.photos/seed/leah/100', availability: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'] },
  { id: '5', name: 'Chris Evans', role: 'Associate', hourlyRate: 22, productivityScore: 65, avatar: 'https://picsum.photos/seed/chris/100', availability: ['Monday', 'Tuesday', 'Wednesday'] },
  { id: '6', name: 'Emma Watson', role: 'Sales Lead', hourlyRate: 30, productivityScore: 92, avatar: 'https://picsum.photos/seed/emma/100', availability: DAYS },
];

export const INITIAL_SHIFTS: Shift[] = DAYS.flatMap(day => [
  { id: `${day}-morning`, day, startTime: '09:00', endTime: '15:00', type: 'Morning', targetSales: 2500, assignedEmployeeId: null },
  { id: `${day}-afternoon`, day, startTime: '15:00', endTime: '21:00', type: 'Afternoon', targetSales: 3500, assignedEmployeeId: null }
]);

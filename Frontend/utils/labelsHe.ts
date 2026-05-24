/** תצוגה בעברית — מפתחות פנימיים נשארים באנגלית (API / DB). */

export const DAY_NAMES_HE: Record<string, string> = {
  Monday: 'יום שני',
  Tuesday: 'יום שלישי',
  Wednesday: 'יום רביעי',
  Thursday: 'יום חמישי',
  Friday: 'יום שישי',
  Saturday: 'שבת',
  Sunday: 'יום ראשון',
};

export const DAY_SHORT_HE: Record<string, string> = {
  Mon: 'ב׳',
  Tue: 'ג׳',
  Wed: 'ד׳',
  Thu: 'ה׳',
  Fri: 'ו׳',
  Sat: 'ש׳',
  Sun: 'א׳',
};

export function formatDayHe(day: string): string {
  return DAY_NAMES_HE[day] ?? day;
}

export function formatShiftTypeHe(type: string): string {
  if (type === 'Morning') return 'בוקר';
  if (type === 'Afternoon') return 'ערב';
  return type;
}

export function formatRoleHe(role: string): string {
  const map: Record<string, string> = {
    Manager: 'מנהל',
    'Sales Lead': 'ראש צוות',
    Associate: 'עובד/ת',
    Employee: 'עובד/ת',
  };
  return map[role] ?? role;
}

export function formatUserRoleHe(role?: string): string {
  if (!role) return '';
  if (role === 'Manager') return 'מנהל';
  if (role === 'Employee') return 'עובד';
  return formatRoleHe(role);
}

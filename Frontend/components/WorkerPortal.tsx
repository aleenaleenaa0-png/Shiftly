/**
 * WorkerPortal.tsx — פורטל העובד
 */
import React, { useState, useEffect } from 'react';
import WorkerHeader from './WorkerHeader';
import WorkerStatCard from './WorkerStatCard';
import WorkerAvailabilityPicker from './WorkerAvailabilityPicker';
import WorkerFinalSchedule from './WorkerFinalSchedule';
import WeekNavigator from './WeekNavigator';
import { formatWeekStartParam, getWeekMonday } from '../utils/week';
import { STANDARD_SHIFT_HOURS } from '../utils/throughput';

interface User {
  userId: number;
  fullName: string;
  email: string;
}

interface WorkerPortalProps {
  user: User;
  onLogout: () => void;
}

const WorkerPortal: React.FC<WorkerPortalProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'availability' | 'schedule'>('schedule');
  const [weekMonday, setWeekMonday] = useState(() => getWeekMonday());
  const [hourlyWage, setHourlyWage] = useState(25);
  const [stats, setStats] = useState({
    paydayEst: '₪0',
    scheduledHours: '0h',
    shiftsThisWeek: '0',
  });

  useEffect(() => {
    fetch('/api/account/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.hourlyWage != null) setHourlyWage(Number(data.hourlyWage) || 25);
        else if (data?.HourlyWage != null) setHourlyWage(Number(data.HourlyWage) || 25);
      })
      .catch(() => {});
  }, [user.userId]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user.userId) return;
      try {
        const weekParam = formatWeekStartParam(weekMonday);
        const shiftsResponse = await fetch(`/api/shifts?weekStart=${weekParam}`, {
          credentials: 'include',
          cache: 'no-cache',
        });
        if (!shiftsResponse.ok) return;

        const data = await shiftsResponse.json();
        const arr = Array.isArray(data) ? data : [];
        const userIdStr = String(user.userId);
        const myShifts = arr.filter((shift: Record<string, unknown>) => {
          const empId = shift.EmployeeId ?? shift.employeeId;
          return empId != null && String(empId) === userIdStr;
        });

        let totalHours = 0;
        for (const shift of myShifts) {
          const start = shift.StartTime ?? shift.startTime;
          const end = shift.EndTime ?? shift.endTime;
          if (start != null && end != null) {
            const startDate =
              typeof start === 'string' ? new Date(String(start)) : new Date(start as Date);
            const endDate =
              typeof end === 'string' ? new Date(String(end)) : new Date(end as Date);
            const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
            totalHours += diff > 0 ? diff : STANDARD_SHIFT_HOURS;
          } else {
            totalHours += STANDARD_SHIFT_HOURS;
          }
        }

        const estimatedPay = Math.round(totalHours * hourlyWage);
        setStats({
          paydayEst: `₪${estimatedPay.toLocaleString('he-IL')}`,
          scheduledHours: `${totalHours.toFixed(1)}h`,
          shiftsThisWeek: String(myShifts.length),
        });
      } catch {
        /* ignore */
      }
    };

    fetchStats();
  }, [user.userId, weekMonday, hourlyWage]);

  return (
    <div
      className="min-h-screen pb-12"
      style={{
        background: 'linear-gradient(135deg, #fef2f2 0%, #f5f3ff 50%, #ecfeff 100%)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <WorkerHeader
        userName={user.fullName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <WeekNavigator weekMonday={weekMonday} onChange={setWeekMonday} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <WorkerStatCard
            label="הערכת שכר השבוע"
            value={stats.paydayEst}
            subValue={`לפי ${hourlyWage} ₪/שעה`}
            icon="💰"
            color="pink"
          />
          <WorkerStatCard
            label="שעות משובצות"
            value={stats.scheduledHours}
            subValue="בשבוע הנבחר"
            icon="⏱️"
            color="purple"
          />
          <WorkerStatCard
            label="משמרות השבוע"
            value={stats.shiftsThisWeek}
            subValue="משמרות ששובצת אליהן"
            icon="📅"
            color="cyan"
          />
        </div>

        {activeTab === 'availability' ? (
          <WorkerAvailabilityPicker userId={user.userId} />
        ) : (
          <WorkerFinalSchedule
            userName={user.fullName}
            userId={user.userId}
            weekMonday={weekMonday}
          />
        )}
      </main>
    </div>
  );
};

export default WorkerPortal;

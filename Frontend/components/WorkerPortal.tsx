import React, { useState, useEffect } from 'react';
import WorkerHeader from './WorkerHeader';
import WorkerStatCard from './WorkerStatCard';
import WorkerAvailabilityPicker from './WorkerAvailabilityPicker';
import WorkerFinalSchedule from './WorkerFinalSchedule';

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
  const [stats, setStats] = useState({
    paydayEst: '$0',
    scheduledHours: '0h',
    shiftAccuracy: '0%',
    openShifts: '0'
  });

  // Helper function to get current week start (Monday)
  const getCurrentWeekStart = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  // Fetch worker stats from same endpoint as schedule (for-employee)
  // Filter to current week before calculating to show weekly stats, not lifetime totals
  // Check for week changes periodically
  useEffect(() => {
    const fetchStats = async () => {
      if (!user.userId) return;
      try {
        const shiftsResponse = await fetch(
          `/api/shifts/for-employee?employeeId=${user.userId}`,
          { credentials: 'include', cache: 'no-cache' }
        );
        if (shiftsResponse.ok) {
          const shifts = await shiftsResponse.json();
          const arr = Array.isArray(shifts) ? shifts : [];
          
          // Calculate current week boundaries (Monday to Sunday)
          const weekMonday = getCurrentWeekStart();
          const weekEnd = new Date(weekMonday);
          weekEnd.setDate(weekMonday.getDate() + 7);
          
          // Filter shifts to current week only
          const currentWeekShifts = arr.filter((shift: any) => {
            const start = shift.StartTime ?? shift.startTime;
            if (start == null) return false;
            const startDate = typeof start === 'string' ? new Date(start) : start;
            return startDate >= weekMonday && startDate < weekEnd;
          });
          
          // Calculate hours only for current week shifts
          let totalHours = 0;
          for (const shift of currentWeekShifts) {
            const start = shift.StartTime ?? shift.startTime;
            const end = shift.EndTime ?? shift.endTime;
            if (start != null && end != null) {
              const startDate = typeof start === 'string' ? new Date(start) : start;
              const endDate = typeof end === 'string' ? new Date(end) : end;
              totalHours += (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
            }
          }
          const estimatedPay = Math.round(totalHours * 25);
          setStats({
            paydayEst: `$${estimatedPay.toLocaleString()}`,
            scheduledHours: `${totalHours.toFixed(1)}h`,
            shiftAccuracy: '98%',
            openShifts: '0'
          });
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      }
    };
    
    // Initial fetch
    fetchStats();
    
    // Check for week changes every hour to update when crossing Sunday/Monday boundary
    const interval = setInterval(fetchStats, 60 * 60 * 1000); // Check every hour
    
    return () => clearInterval(interval);
  }, [user.userId]);

  return (
    <div className="min-h-screen pb-12" style={{
      background: 'linear-gradient(135deg, #fef2f2 0%, #f5f3ff 50%, #ecfeff 100%)',
      fontFamily: "'Inter', sans-serif"
    }}>
      <WorkerHeader 
        userName={user.fullName} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        onLogout={onLogout}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <WorkerStatCard 
            label="Next Payday Est." 
            value={stats.paydayEst} 
            subValue="Based on scheduled hours" 
            icon="💰" 
            color="pink" 
          />
          <WorkerStatCard 
            label="Scheduled Hours" 
            value={stats.scheduledHours} 
            subValue="This week" 
            icon="⏱️" 
            color="purple" 
          />
          <WorkerStatCard 
            label="Shift Accuracy" 
            value={stats.shiftAccuracy} 
            subValue="Perfect attendance" 
            icon="📈" 
            color="cyan" 
          />
          <WorkerStatCard 
            label="Open Shifts" 
            value={stats.openShifts} 
            subValue="Available to claim" 
            icon="🔔" 
            color="gray" 
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content Area */}
          <div className="flex-grow">
            {activeTab === 'availability' ? (
              <WorkerAvailabilityPicker userId={user.userId} />
            ) : (
              <WorkerFinalSchedule userName={user.fullName} userId={user.userId} />
            )}
          </div>

          {/* Right Sidebar - Staff / News */}
          <div className="w-full lg:w-80 space-y-6">
            <div className="glass-card rounded-3xl p-6 shadow-xl border border-white">
              <h3 className="text-gray-800 font-bold flex items-center gap-2 mb-4">
                <span className="p-2 bg-pink-100 rounded-lg text-pink-600">👥</span>
                Team Working Today
              </h3>
              <div className="space-y-4">
                <div className="text-center py-4 text-gray-500 text-sm">
                  Team information will appear here
                </div>
              </div>
            </div>

            <div className="glass-card rounded-3xl p-6 shadow-xl border border-white">
              <h3 className="text-gray-800 font-bold mb-4">Manager's Note</h3>
              <p className="text-sm text-gray-600 leading-relaxed italic">
                "Check back here for important updates from your manager."
              </p>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
      `}} />
    </div>
  );
};

export default WorkerPortal;


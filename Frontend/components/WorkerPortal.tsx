import React, { useState, useEffect } from 'react';
import WorkerHeader from './WorkerHeader';
import WorkerStatCard from './WorkerStatCard';
import WorkerAvailabilityPicker from './WorkerAvailabilityPicker';
import WorkerFinalSchedule from './WorkerFinalSchedule';

interface User {
  userId: number;
  fullName: string;
  email: string;
  storeId: number;
  storeName?: string;
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

  // Fetch worker stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch shifts to calculate stats
        const shiftsResponse = await fetch('/api/shifts', {
          credentials: 'include'
        });
        
        if (shiftsResponse.ok) {
          const shifts = await shiftsResponse.json();
          const userShifts = shifts.filter((s: any) => 
            (s.assignedEmployeeId === user.userId || s.AssignedEmployeeId === user.userId)
          );
          
          // Calculate scheduled hours
          const totalHours = userShifts.reduce((acc: number, shift: any) => {
            const start = parseInt((shift.startTime || shift.StartTime || '09:00').split(':')[0]);
            const end = parseInt((shift.endTime || shift.EndTime || '17:00').split(':')[0]);
            return acc + (end - start);
          }, 0);

          // Estimate pay (assuming $25/hour average - should come from employee data)
          const estimatedPay = totalHours * 25;

          setStats({
            paydayEst: `$${estimatedPay.toLocaleString()}`,
            scheduledHours: `${totalHours}h`,
            shiftAccuracy: '98%', // This could be calculated from attendance data
            openShifts: '0' // Could fetch open shifts
          });
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      }
    };

    fetchStats();
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


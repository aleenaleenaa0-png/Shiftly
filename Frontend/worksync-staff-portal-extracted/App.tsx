
import React, { useState } from 'react';
import Header from './components/Header';
import StatCard from './components/StatCard';
import AvailabilityPicker from './components/AvailabilityPicker';
import FinalSchedule from './components/FinalSchedule';
import { MOCK_USER } from './constants';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'availability' | 'schedule'>('schedule');

  return (
    <div className="min-h-screen pb-12">
      <Header 
        userName={MOCK_USER.name} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Next Payday Est." value="$1,240" subValue="+4.2% vs Last Period" icon="💰" color="pink" />
          <StatCard label="Scheduled Hours" value="32.5h" subValue="Goal: 40h" icon="⏱️" color="purple" />
          <StatCard label="Shift Accuracy" value="98%" subValue="Perfect attendance" icon="📈" color="cyan" />
          <StatCard label="Open Shifts" value="4" subValue="Available to claim" icon="🔔" color="gray" />
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content Area */}
          <div className="flex-grow">
            {activeTab === 'availability' ? (
              <AvailabilityPicker />
            ) : (
              <FinalSchedule userName={MOCK_USER.name} />
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
                {[
                  { name: 'Jordan Michaels', role: 'Manager', status: 'On Shift', img: 'https://i.pravatar.cc/150?u=1' },
                  { name: 'Sarah Jenkins', role: 'Sales Lead', status: 'Starting 15:00', img: 'https://i.pravatar.cc/150?u=2' },
                  { name: 'Marcus Miller', role: 'Associate', status: 'On Shift', img: 'https://i.pravatar.cc/150?u=3' },
                ].map((member, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/50 transition-colors">
                    <img src={member.img} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="" />
                    <div className="flex-grow">
                      <p className="text-sm font-bold text-gray-800">{member.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-tighter">{member.role}</p>
                    </div>
                    <div className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-600">
                      {member.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-3xl p-6 shadow-xl border border-white">
              <h3 className="text-gray-800 font-bold mb-4">Manager's Note</h3>
              <p className="text-sm text-gray-600 leading-relaxed italic">
                "Great job last week everyone! Sales were up 15%. Please make sure to update your availability for the holiday weekend by Thursday."
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

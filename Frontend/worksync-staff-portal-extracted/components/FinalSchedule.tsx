
import React, { useState, useEffect } from 'react';
import { Shift } from '../types';
import { getScheduleInsights } from '../services/geminiService';
import { MOCK_FINAL_SCHEDULE, DAYS_OF_WEEK } from '../constants';

interface FinalScheduleProps {
  userName: string;
}

const FinalSchedule: React.FC<FinalScheduleProps> = ({ userName }) => {
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoadingInsights(true);
      const result = await getScheduleInsights(MOCK_FINAL_SCHEDULE.shifts, userName);
      setInsights(result);
      setLoadingInsights(false);
    };
    fetchInsights();
  }, [userName]);

  const getShiftForSlot = (day: string, slot: 'morning' | 'evening') => {
    // Basic mapping: 09:00-15:00 is morning, others evening
    return MOCK_FINAL_SCHEDULE.shifts.find(s => {
      const shiftDate = new Date(s.date).toLocaleDateString('en-US', { weekday: 'long' });
      if (shiftDate !== day) return false;
      const hour = parseInt(s.startTime.split(':')[0]);
      return slot === 'morning' ? hour < 12 : hour >= 12;
    });
  };

  return (
    <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl border border-white overflow-hidden relative">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-black text-gray-800 flex items-center gap-3">
             <span className="text-pink-500 italic">Shiftly</span> — Weekly Grid
          </h2>
          <p className="text-sm font-medium text-gray-400 mt-1">Viewing finalized schedule for May 20 - May 26</p>
        </div>
        <div className="flex gap-2">
           <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[10px] font-bold">● Published</span>
           <span className="px-3 py-1 bg-white border text-gray-500 rounded-full text-[10px] font-bold">May 2024</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-6 text-[10px] font-black text-gray-300 uppercase tracking-widest">Day</th>
              <th className="pb-6 text-[10px] font-black text-gray-300 uppercase tracking-widest text-center">Morning Shift (09-15)</th>
              <th className="pb-6 text-[10px] font-black text-gray-300 uppercase tracking-widest text-center">Evening Shift (15-21)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {DAYS_OF_WEEK.map((day) => {
              const morningShift = getShiftForSlot(day, 'morning');
              const eveningShift = getShiftForSlot(day, 'evening');

              return (
                <tr key={day} className="group transition-colors hover:bg-white/30">
                  <td className="py-8 font-black text-gray-800 text-lg">{day}</td>
                  
                  {/* Morning Cell */}
                  <td className="py-8 px-4">
                    {morningShift ? (
                      <div className={`p-4 rounded-3xl shadow-sm border ${
                        morningShift.workerName === userName 
                        ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-transparent ring-4 ring-indigo-100' 
                        : 'bg-white/80 text-gray-600 border-gray-100 opacity-60'
                      }`}>
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-black text-xs uppercase tracking-tighter">{morningShift.workerName}</p>
                          <span className="text-[10px] opacity-70">{morningShift.startTime} - {morningShift.endTime}</span>
                        </div>
                        <p className={`text-[10px] font-bold ${morningShift.workerName === userName ? 'text-indigo-100' : 'text-gray-400'}`}>
                          {morningShift.role}
                        </p>
                      </div>
                    ) : (
                      <div className="h-20 border-2 border-dashed border-gray-100 rounded-3xl flex items-center justify-center text-gray-300 font-bold text-xs uppercase tracking-widest">
                        Empty
                      </div>
                    )}
                  </td>

                  {/* Evening Cell */}
                  <td className="py-8 px-4">
                    {eveningShift ? (
                      <div className={`p-4 rounded-3xl shadow-sm border ${
                        eveningShift.workerName === userName 
                        ? 'bg-gradient-to-br from-pink-500 to-pink-600 text-white border-transparent ring-4 ring-pink-100' 
                        : 'bg-white/80 text-gray-600 border-gray-100 opacity-60'
                      }`}>
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-black text-xs uppercase tracking-tighter">{eveningShift.workerName}</p>
                          <span className="text-[10px] opacity-70">{eveningShift.startTime} - {eveningShift.endTime}</span>
                        </div>
                        <p className={`text-[10px] font-bold ${eveningShift.workerName === userName ? 'text-pink-100' : 'text-gray-400'}`}>
                          {eveningShift.role}
                        </p>
                      </div>
                    ) : (
                      <div className="h-20 border-2 border-dashed border-gray-100 rounded-3xl flex items-center justify-center text-gray-300 font-bold text-xs uppercase tracking-widest">
                        Empty
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AI Insights Bar */}
      <div className="mt-12 bg-indigo-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
           <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <h4 className="text-cyan-400 font-black uppercase text-xs tracking-widest">Gemini AI Assistant</h4>
          </div>
          <div className="max-w-3xl">
            {loadingInsights ? (
               <div className="flex gap-2">
                 {[1,2,3].map(i => <div key={i} className="h-4 w-4 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: `${i*0.2}s`}}></div>)}
               </div>
            ) : (
              <p className="text-indigo-50 font-medium leading-relaxed italic text-lg">
                "{insights}"
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalSchedule;

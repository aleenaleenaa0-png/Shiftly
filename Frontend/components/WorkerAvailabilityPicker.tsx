import React, { useState, useEffect } from 'react';
import { DAYS } from '../constants';

const DAYS_OF_WEEK = DAYS;

type SlotStatus = 'Available' | 'Busy' | 'Neutral';

interface WorkerAvailabilityPickerProps {
  userId: number;
}

const WorkerAvailabilityPicker: React.FC<WorkerAvailabilityPickerProps> = ({ userId }) => {
  const [selections, setSelections] = useState<Record<string, Record<'morning' | 'evening', SlotStatus>>>(
    DAYS_OF_WEEK.reduce((acc, day) => ({
      ...acc,
      [day]: { morning: 'Neutral', evening: 'Neutral' }
    }), {})
  );

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing availability from backend
  useEffect(() => {
    const loadAvailability = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/availabilities/employee/${userId}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          // Map backend availability data to frontend format
          // This is a simplified mapping - adjust based on your backend structure
          if (data && data.length > 0) {
            const newSelections: Record<string, Record<'morning' | 'evening', SlotStatus>> = {};
            DAYS_OF_WEEK.forEach(day => {
              newSelections[day] = { morning: 'Neutral', evening: 'Neutral' };
            });
            // Process availability data here if needed
            setSelections(newSelections);
          }
        }
      } catch (err) {
        console.error('Error loading availability:', err);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadAvailability();
    }
  }, [userId]);

  const toggleSlot = (day: string, slot: 'morning' | 'evening') => {
    const next: Record<SlotStatus, SlotStatus> = {
      'Neutral': 'Available',
      'Available': 'Busy',
      'Busy': 'Neutral'
    };
    setSelections(prev => ({
      ...prev,
      [day]: { ...prev[day], [slot]: next[prev[day][slot]] }
    }));
  };

  const getSlotStyles = (status: SlotStatus) => {
    switch (status) {
      case 'Available': return 'bg-green-500 text-white border-green-400 ring-green-100';
      case 'Busy': return 'bg-red-500 text-white border-red-400 ring-red-100';
      default: return 'bg-white text-gray-400 border-gray-100 hover:border-indigo-300';
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Convert selections to backend format and submit
      const availabilityData = DAYS_OF_WEEK.flatMap(day => {
        const dayData = selections[day];
        const availabilities = [];
        
        if (dayData.morning !== 'Neutral') {
          availabilities.push({
            dayOfWeek: day,
            timeSlot: 'Morning',
            status: dayData.morning === 'Available' ? 'AVAILABLE' : 'UNAVAILABLE'
          });
        }
        
        if (dayData.evening !== 'Neutral') {
          availabilities.push({
            dayOfWeek: day,
            timeSlot: 'Evening',
            status: dayData.evening === 'Available' ? 'AVAILABLE' : 'UNAVAILABLE'
          });
        }
        
        return availabilities;
      });

      const response = await fetch(`/api/availabilities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          employeeId: userId,
          availabilities: availabilityData
        })
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error('Failed to save availability');
      }
    } catch (err) {
      console.error('Error saving availability:', err);
      alert('Failed to save availability. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-[2.5rem] p-10 shadow-2xl border border-white">
        <div className="text-center py-12">
          <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4"></i>
          <p className="text-slate-500">Loading availability...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-[2.5rem] p-10 shadow-2xl border border-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-800">Set Availability</h2>
          <p className="text-sm font-medium text-gray-400 mt-1">Tap slots to toggle: Neutral ➔ Available ➔ Busy</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-[10px] font-black uppercase text-gray-400">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-[10px] font-black uppercase text-gray-400">Busy</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {DAYS_OF_WEEK.map((day) => (
          <div key={day} className="flex flex-col md:flex-row items-center gap-6 p-4 rounded-[2rem] hover:bg-white/40 transition-colors border border-transparent hover:border-white">
            <div className="w-32 font-black text-xl text-gray-800">{day}</div>
            
            <div className="flex-grow grid grid-cols-2 gap-4 w-full">
              {(['morning', 'evening'] as const).map(slot => (
                <button
                  key={slot}
                  onClick={() => toggleSlot(day, slot)}
                  className={`py-6 px-4 rounded-3xl border-2 font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-sm flex flex-col items-center justify-center gap-2 ${getSlotStyles(selections[day][slot])}`}
                >
                  <span className="opacity-60">{slot === 'morning' ? '09:15' : '15:21'}</span>
                  <div className="flex items-center gap-2">
                    {selections[day][slot] === 'Neutral' && <span className="text-lg">+</span>}
                    {selections[day][slot] === 'Available' && <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                    {selections[day][slot] === 'Busy' && <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>}
                    <span>{selections[day][slot]}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`px-10 py-5 rounded-[2rem] font-black text-white text-lg shadow-2xl transition-all active:scale-95 flex items-center gap-4 ${
            success ? 'bg-green-500 scale-105' : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 hover:shadow-indigo-200'
          }`}
        >
          {submitting ? 'Updating...' : success ? '✓ Saved!' : 'Update Availability'}
          {!submitting && !success && (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default WorkerAvailabilityPicker;


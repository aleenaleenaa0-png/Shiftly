/**
 * WorkerAvailabilityPicker.tsx — اختيار التوفر داخل WorkerPortal
 * نفس منطق EmployeeAvailability: حفظ كل فتحة في Access عبر API.
 */
import React, { useState, useEffect } from 'react';
import { DAYS } from '../constants';

const DAYS_OF_WEEK = DAYS;

type SlotStatus = 'Available' | 'Busy' | 'Neutral';

interface WorkerAvailabilityPickerProps {
  userId: number;
}

const WorkerAvailabilityPicker: React.FC<WorkerAvailabilityPickerProps> = ({ userId }) => {
  // Validate userId on mount
  useEffect(() => {
    if (!userId || userId <= 0) {
      console.error('WorkerAvailabilityPicker: Invalid userId received:', userId);
      alert('Error: Invalid user ID. Please log out and log back in.');
    } else {
      console.log('WorkerAvailabilityPicker: Component initialized with userId:', userId, 'Type:', typeof userId);
    }
  }, [userId]);
  
  const [selections, setSelections] = useState<Record<string, Record<'morning' | 'evening', SlotStatus>>>(
    DAYS_OF_WEEK.reduce((acc, day) => ({
      ...acc,
      [day]: { morning: 'Neutral', evening: 'Neutral' }
    }), {})
  );

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  // Map slot number (1-14) to day + morning/evening. Slot 1=Mon AM, 2=Mon PM, ... 14=Sun PM.
  const slotToDayAndPart = (slotNum: number): { day: string; part: 'morning' | 'evening' } => {
    const dayIndex = Math.floor((slotNum - 1) / 2);
    const part: 'morning' | 'evening' = (slotNum - 1) % 2 === 0 ? 'morning' : 'evening';
    return { day: DAYS_OF_WEEK[dayIndex], part };
  };
  const dayAndPartToSlot = (day: string, part: 'morning' | 'evening'): number => {
    const dayIndex = DAYS_OF_WEEK.indexOf(day);
    return dayIndex * 2 + (part === 'morning' ? 1 : 2);
  };

  // Load existing availability from backend (availabilityMap by slot 1-14)
  const loadAvailability = async () => {
    try {
      setLoading(true);
      console.log('═══════════════════════════════════════════════════════');
      console.log('WorkerAvailabilityPicker: 🔄 LOADING AVAILABILITY FROM DATABASE');
      console.log(`  UserId (EmployeeId): ${userId}`);
      console.log(`  Type: ${typeof userId}`);
      console.log('═══════════════════════════════════════════════════════');
      
      const response = await fetch(`/api/availabilities/employee/${userId}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      console.log(`WorkerAvailabilityPicker: API Response - status=${response.status}, statusText=${response.statusText}, ok=${response.ok}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('WorkerAvailabilityPicker: ✅ API Response Data:', JSON.stringify(data, null, 2));
        const raw = data.availabilityMap || {};
        console.log('WorkerAvailabilityPicker: Raw availabilityMap object:', raw);
        console.log('WorkerAvailabilityPicker: AvailabilityMap keys:', Object.keys(raw));
        console.log('WorkerAvailabilityPicker: AvailabilityMap values:', Object.values(raw));
        
        const newSelections: Record<string, Record<'morning' | 'evening', SlotStatus>> = {};
        DAYS_OF_WEEK.forEach(day => {
          newSelections[day] = { morning: 'Neutral', evening: 'Neutral' };
        });
        
        let loadedCount = 0;
        for (let slot = 1; slot <= 14; slot++) {
          // Try both string and number keys
          const v = raw[String(slot)] ?? raw[slot] ?? raw[`${slot}`];
          console.log(`WorkerAvailabilityPicker: Slot ${slot}: raw[String(${slot})]=${raw[String(slot)]}, raw[${slot}]=${raw[slot]}, final value=${v}`);
          
          if (v === true) {
            const { day, part } = slotToDayAndPart(slot);
            if (newSelections[day]) {
              newSelections[day][part] = 'Available';
              loadedCount++;
              console.log(`WorkerAvailabilityPicker: ✓ Loaded slot ${slot} (${day} ${part}) as Available`);
            }
          }
        }
        
        console.log(`WorkerAvailabilityPicker: ✅ LOADED ${loadedCount} available slots from database`);
        console.log('WorkerAvailabilityPicker: Final mapped selections:', JSON.stringify(newSelections, null, 2));
        
        if (loadedCount === 0) {
          console.warn('WorkerAvailabilityPicker: ⚠️ WARNING: No availability found in database! This could mean:');
          console.warn('  1. Availability was never saved');
          console.warn('  2. Availability was saved but not found (check employee ID match)');
          console.warn('  3. Database query issue');
        } else {
          console.log(`WorkerAvailabilityPicker: ✅ SUCCESS: Availability restored from database (${loadedCount} slots)`);
        }
        
        setSelections(newSelections);
      } else {
        const errorText = await response.text();
        console.error('WorkerAvailabilityPicker: ❌ Failed to load availability:', response.status, errorText);
        // Don't show alert on 404 - just means no availability saved yet
        if (response.status !== 404) {
          console.error('WorkerAvailabilityPicker: Unexpected error loading availability');
          alert(`Failed to load availability: ${response.status} ${errorText}\n\nPlease try refreshing the page.`);
        } else {
          console.log('WorkerAvailabilityPicker: No availability found (404) - this is normal for first-time users');
        }
      }
    } catch (err) {
      console.error('WorkerAvailabilityPicker: ❌ Exception loading availability:', err);
      alert(`Error loading availability: ${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease try refreshing the page.`);
    } finally {
      setLoading(false);
      console.log('WorkerAvailabilityPicker: Load complete');
    }
  };

  useEffect(() => {
    if (userId && userId > 0) {
      console.log('WorkerAvailabilityPicker: Component mounted/updated, loading availability for userId=', userId);
      loadAvailability();
    } else {
      console.warn('WorkerAvailabilityPicker: Invalid userId, not loading availability:', userId);
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

  // Save each slot (1-14) via set-availability so one row per slot is created in the DB
  const handleSubmit = async () => {
    // Validate userId before proceeding
    if (!userId || userId <= 0) {
      alert('Error: Invalid user ID. Please log out and log back in.');
      console.error('WorkerAvailabilityPicker: Invalid userId:', userId);
      return;
    }
    
    setSubmitting(true);
    setSuccess(false);
    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('WorkerAvailabilityPicker: Starting to save availability');
      console.log('  userId (EmployeeId):', userId);
      console.log('  Type:', typeof userId);
      console.log('═══════════════════════════════════════════════════════');
      
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      
      for (let slotNumber = 1; slotNumber <= 14; slotNumber++) {
        const { day, part } = slotToDayAndPart(slotNumber);
        const status = selections[day]?.[part] ?? 'Neutral';
        const isAvailable = status === 'Available';
        
        console.log(`WorkerAvailabilityPicker: Saving slot ${slotNumber} (${day} ${part}) - isAvailable=${isAvailable}`);
        
        try {
          const requestBody = {
            employeeId: Number(userId), // Ensure it's a number
            slotNumber: Number(slotNumber),
            isAvailable: Boolean(isAvailable)
          };
          
          console.log(`WorkerAvailabilityPicker: Request body for slot ${slotNumber}:`, requestBody);
          
          const response = await fetch('/api/availabilities/set-availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(requestBody)
          });
          
          console.log(`WorkerAvailabilityPicker: Response status for slot ${slotNumber}:`, response.status, response.statusText);
          
          if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: errorText, message: errorText };
            }
            console.error(`WorkerAvailabilityPicker: ✗ Error saving slot ${slotNumber}:`, {
              status: response.status,
              statusText: response.statusText,
              error: errorData
            });
            errorCount++;
            errors.push(`Slot ${slotNumber} (${day} ${part}): ${errorData.message || errorData.error || response.statusText}`);
            // Continue with other slots even if one fails
            continue;
          }
          
          const result = await response.json();
          console.log(`WorkerAvailabilityPicker: ✓✓✓ Successfully saved slot ${slotNumber}:`, result);
          successCount++;
        } catch (slotError: any) {
          console.error(`WorkerAvailabilityPicker: ✗✗✗ Exception saving slot ${slotNumber}:`, slotError);
          errorCount++;
          errors.push(`Slot ${slotNumber} (${day} ${part}): ${slotError.message || 'Network error'}`);
          // Continue with other slots even if one fails
        }
      }
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('WorkerAvailabilityPicker: Save complete');
      console.log(`  ✓ Succeeded: ${successCount} slots`);
      console.log(`  ✗ Failed: ${errorCount} slots`);
      if (errors.length > 0) {
        console.log('  Errors:', errors);
      }
      console.log('═══════════════════════════════════════════════════════');
      
      if (errorCount === 0) {
        setSuccess(true);
        // Show success message
        alert(`✓ Successfully saved your availability for ${successCount} shift(s)!\n\nYour availability has been saved to the database and will persist even after you log out. When you log back in, your choices will still be there.`);
        
        // Reload availability immediately to confirm it was saved and persisted to database
        console.log('WorkerAvailabilityPicker: Reloading availability immediately to verify persistence...');
        // Use setTimeout to allow state to update first, then reload
        setTimeout(async () => {
          await loadAvailability();
          console.log('WorkerAvailabilityPicker: ✓ Availability reloaded - verifying it was saved correctly');
          
          // Verify the reloaded data matches what we saved
          const response = await fetch(`/api/availabilities/employee/${userId}`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-cache'
          });
          
          if (response.ok) {
            const data = await response.json();
            const availabilityMap = data.availabilityMap || {};
            const savedCount = Object.values(availabilityMap).filter((v: any) => v === true).length;
            console.log(`WorkerAvailabilityPicker: ✓✓✓ VERIFICATION: Found ${savedCount} available shifts in database after save`);
            
            if (savedCount === successCount) {
              console.log('WorkerAvailabilityPicker: ✓✓✓ PERFECT! All saved availability matches database');
            } else {
              console.warn(`WorkerAvailabilityPicker: ⚠ WARNING: Saved ${successCount} but database shows ${savedCount}`);
            }
          }
        }, 1000);
      } else {
        const errorMessage = `Saved ${successCount} slots, but ${errorCount} failed:\n\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}\n\nCheck browser console (F12) for full details.`;
        alert(errorMessage);
      }
    } catch (err: any) {
      console.error('WorkerAvailabilityPicker: ✗✗✗ CRITICAL ERROR saving availability:', err);
      alert(`Failed to save availability: ${err.message || 'Unknown error'}\n\nCheck browser console (F12) for details.`);
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


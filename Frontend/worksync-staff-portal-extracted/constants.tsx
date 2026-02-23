
import React from 'react';

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const MOCK_USER = {
  id: 'usr_123',
  name: 'Alex Rivera',
  role: 'Worker'
};

// Mock finalized schedule for the current week
export const MOCK_FINAL_SCHEDULE = {
  weekStart: '2024-05-20',
  status: 'Finalized',
  shifts: [
    { id: '1', workerName: 'Alex Rivera', startTime: '09:00', endTime: '17:00', role: 'Sales Lead', date: '2024-05-20' },
    { id: '2', workerName: 'Jordan Smith', startTime: '09:00', endTime: '17:00', role: 'Support', date: '2024-05-20' },
    { id: '3', workerName: 'Alex Rivera', startTime: '10:00', endTime: '18:00', role: 'Sales Lead', date: '2024-05-22' },
    { id: '4', workerName: 'Casey Chen', startTime: '12:00', endTime: '20:00', role: 'Inventory', date: '2024-05-23' },
    { id: '5', workerName: 'Alex Rivera', startTime: '08:00', endTime: '16:00', role: 'Sales Lead', date: '2024-05-24' },
  ]
};

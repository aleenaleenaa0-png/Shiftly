
import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  subValue: string;
  icon: string;
  color: 'pink' | 'purple' | 'cyan' | 'gray';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, subValue, icon, color }) => {
  const colorMap = {
    pink: 'text-pink-600',
    purple: 'text-indigo-600',
    cyan: 'text-cyan-600',
    gray: 'text-gray-600'
  };

  return (
    <div className="glass-card rounded-3xl p-6 shadow-xl border border-white flex flex-col justify-between h-40 transition-transform hover:scale-[1.02]">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div>
        <h3 className={`text-4xl font-black ${colorMap[color]}`}>{value}</h3>
        <p className={`text-xs font-bold mt-2 ${color === 'pink' ? 'text-pink-400' : 'text-gray-400'}`}>
          {subValue}
        </p>
      </div>
    </div>
  );
};

export default StatCard;

import React from 'react';
import { addWeeks, formatWeekLabel, getWeekMonday, isCurrentWeek } from '../utils/week';

interface WeekNavigatorProps {
  weekMonday: Date;
  onChange: (monday: Date) => void;
  className?: string;
}

const WeekNavigator: React.FC<WeekNavigatorProps> = ({ weekMonday, onChange, className = '' }) => {
  const current = isCurrentWeek(weekMonday);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(addWeeks(weekMonday, -1))}
        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white/90 text-slate-700 text-sm font-semibold hover:bg-rose-50 transition-colors"
        aria-label="שבוע קודם"
      >
        <i className="fas fa-chevron-right" />
      </button>
      <span className="text-sm font-bold text-slate-800 dir-rtl min-w-[10rem] text-center">
        {formatWeekLabel(weekMonday)}
        {current && (
          <span className="mr-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            השבוע
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onChange(addWeeks(weekMonday, 1))}
        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white/90 text-slate-700 text-sm font-semibold hover:bg-rose-50 transition-colors"
        aria-label="שבוע הבא"
      >
        <i className="fas fa-chevron-left" />
      </button>
      {!current && (
        <button
          type="button"
          onClick={() => onChange(getWeekMonday())}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors dir-rtl"
        >
          חזרה לשבוע הנוכחי
        </button>
      )}
    </div>
  );
};

export default WeekNavigator;

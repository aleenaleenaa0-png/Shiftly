import React from 'react';

interface WorkerHeaderProps {
  userName: string;
  activeTab: 'availability' | 'schedule';
  setActiveTab: (tab: 'availability' | 'schedule') => void;
  onLogout: () => void;
}

const WorkerHeader: React.FC<WorkerHeaderProps> = ({
  userName,
  activeTab,
  setActiveTab,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-md dir-rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col gap-3">
          {/* שורה עליונה: לוגו | משתמש | יציאה בקצה */}
          <div className="flex items-center gap-3 min-h-[3rem] w-full">
            <div className="flex items-center gap-3 min-w-0 shrink-0">
              <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-rose-100 to-purple-100 rounded-xl flex items-center justify-center">
                <i className="fas fa-calendar-days text-rose-500 text-lg" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-purple-600 leading-tight truncate">
                  Shiftly
                </h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  פורטל עובד
                </p>
              </div>
            </div>

            <div className="flex-1 flex justify-center min-w-0" aria-hidden />
            <div className="text-right hidden sm:block max-w-[10rem] shrink-0 pe-3 border-e border-slate-200">
              <p className="text-xs font-bold text-slate-800 truncate">{userName}</p>
              <p className="text-[10px] text-slate-500">עובד/ת</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-sm transition-colors"
              title="התנתקות"
            >
              <i className="fas fa-sign-out-alt" aria-hidden />
              <span className="hidden sm:inline">יציאה</span>
            </button>
          </div>

          {/* שורת טאבים — ברוחב מלא במובייל */}
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`flex-1 sm:flex-none sm:px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                activeTab === 'schedule'
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <i className="fas fa-calendar-alt" />
              הלוח שלי
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('availability')}
              className={`flex-1 sm:flex-none sm:px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                activeTab === 'availability'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <i className="fas fa-hand-paper" />
              זמינות
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default WorkerHeader;

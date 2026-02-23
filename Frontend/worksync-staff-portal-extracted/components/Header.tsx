
import React from 'react';

interface HeaderProps {
  userName: string;
  activeTab: 'availability' | 'schedule';
  setActiveTab: (tab: 'availability' | 'schedule') => void;
}

const Header: React.FC<HeaderProps> = ({ userName, activeTab, setActiveTab }) => {
  return (
    <header className="glass-card border-b border-white/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shadow-inner">
               <svg className="w-6 h-6 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/>
               </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-600 leading-none">
                Shiftly
              </h1>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Smart Scheduling</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveTab('schedule')}
              className={`px-6 py-2 rounded-full font-bold text-sm transition-all flex items-center gap-2 ${
                activeTab === 'schedule' 
                ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white shadow-lg shadow-pink-200 scale-105' 
                : 'text-gray-500 hover:bg-white/50'
              }`}
            >
              📅 Schedule
            </button>
            <button 
              onClick={() => setActiveTab('availability')}
              className={`px-6 py-2 rounded-full font-bold text-sm transition-all flex items-center gap-2 ${
                activeTab === 'availability' 
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-400 text-white shadow-lg shadow-indigo-200 scale-105' 
                : 'text-gray-500 hover:bg-white/50'
              }`}
            >
              🤝 Availability
            </button>

            <div className="h-8 w-[1px] bg-gray-200 mx-2"></div>

            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-gray-800">{userName}</p>
                <p className="text-[10px] text-gray-500 uppercase">Worker Account</p>
              </div>
              <button className="p-2 bg-red-500 text-white rounded-xl shadow-lg shadow-red-100 hover:bg-red-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

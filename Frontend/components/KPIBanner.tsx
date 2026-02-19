
import React from 'react';
import { ScheduleKPIs } from '../types';

interface KPIBannerProps {
  kpis: ScheduleKPIs;
}

const KPIBanner: React.FC<KPIBannerProps> = ({ kpis }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-rose-500/10 border border-rose-200/50 flex flex-col hover:shadow-rose-500/20 transition-all group transform hover:scale-105">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-600 text-sm font-semibold">Estimated Labor Cost</span>
          <i className="fas fa-dollar-sign text-rose-400 group-hover:text-rose-500 transition-colors"></i>
        </div>
        <span className="text-3xl font-black text-slate-800 mb-2">${kpis.totalCost.toLocaleString()}</span>
        <div className="mt-2 text-xs text-orange-500 font-semibold flex items-center">
          <i className="fas fa-arrow-up mr-1"></i> 3.2% vs Last Week
        </div>
      </div>
      
      <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-green-500/10 border border-green-200/50 flex flex-col hover:shadow-green-500/20 transition-all group transform hover:scale-105">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-600 text-sm font-semibold">Target Revenue</span>
          <i className="fas fa-chart-line text-green-500 group-hover:text-green-600 transition-colors"></i>
        </div>
        <span className="text-3xl font-black text-slate-800 mb-2">${kpis.totalTargetSales.toLocaleString()}</span>
        <div className="mt-2 text-xs text-green-500 font-semibold flex items-center">
          <i className="fas fa-bullseye mr-1"></i> Goal: $50,000
        </div>
      </div>

      <div className="bg-gradient-to-br from-rose-100 to-purple-100 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-purple-500/20 border border-purple-300/50 flex flex-col hover:shadow-purple-500/30 transition-all group transform hover:scale-105">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-700 text-sm font-semibold">Efficiency Score</span>
          <i className="fas fa-star text-yellow-500 group-hover:text-yellow-600 transition-colors"></i>
        </div>
        <span className="text-3xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-2">{(kpis.efficiencyRatio || 0).toFixed(1)}x</span>
        <div className="mt-2 text-xs text-slate-600 font-semibold">ROI per $ spent on labor</div>
      </div>

      <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-cyan-500/10 border border-cyan-200/50 flex flex-col hover:shadow-cyan-500/20 transition-all group transform hover:scale-105">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-600 text-sm font-semibold">Shift Coverage</span>
          <i className="fas fa-calendar-check text-cyan-500 group-hover:text-cyan-600 transition-colors"></i>
        </div>
        <div className="flex items-center space-x-3 mt-1">
            <span className="text-3xl font-black text-slate-800">{kpis.coveragePercentage}%</span>
            <div className="flex-1 bg-rose-100 rounded-full h-3 overflow-hidden">
                <div 
                    className="bg-gradient-to-r from-rose-400 via-purple-400 to-cyan-400 h-3 rounded-full transition-all duration-500 shadow-md" 
                    style={{ width: `${kpis.coveragePercentage}%` }}
                ></div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default KPIBanner;

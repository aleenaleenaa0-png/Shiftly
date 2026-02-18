
import React from 'react';
import { ScheduleKPIs } from '../types';

interface KPIBannerProps {
  kpis: ScheduleKPIs;
}

const KPIBanner: React.FC<KPIBannerProps> = ({ kpis }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
        <span className="text-slate-500 text-sm font-medium">Estimated Labor Cost</span>
        <span className="text-2xl font-bold text-slate-900">${kpis.totalCost.toLocaleString()}</span>
        <div className="mt-2 text-xs text-red-500 font-semibold flex items-center">
          <i className="fas fa-arrow-up mr-1"></i> 3.2% vs Last Week
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
        <span className="text-slate-500 text-sm font-medium">Target Revenue</span>
        <span className="text-2xl font-bold text-slate-900">${kpis.totalTargetSales.toLocaleString()}</span>
        <div className="mt-2 text-xs text-green-500 font-semibold flex items-center">
          <i className="fas fa-bullseye mr-1"></i> Goal: $50,000
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
        <span className="text-slate-500 text-sm font-medium">Efficiency Score</span>
        <span className="text-2xl font-bold text-indigo-600">{(kpis.efficiencyRatio || 0).toFixed(1)}x</span>
        <div className="mt-2 text-xs text-slate-400">ROI per $ spent on labor</div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
        <span className="text-slate-500 text-sm font-medium">Shift Coverage</span>
        <div className="flex items-center space-x-2 mt-1">
            <span className="text-2xl font-bold text-slate-900">{kpis.coveragePercentage}%</span>
            <div className="w-full bg-slate-100 rounded-full h-2">
                <div 
                    className="bg-red-600 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${kpis.coveragePercentage}%` }}
                ></div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default KPIBanner;

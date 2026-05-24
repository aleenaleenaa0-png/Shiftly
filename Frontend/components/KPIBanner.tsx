import React from 'react';
import { ScheduleKPIs } from '../types';

interface KPIBannerProps {
  kpis: ScheduleKPIs;
}

const KPIBanner: React.FC<KPIBannerProps> = ({ kpis }) => {
  const openShifts = Math.max(0, kpis.totalShifts - kpis.filledShifts);
  const salesRatio =
    kpis.salesPerPayrollDollar > 0 ? kpis.salesPerPayrollDollar.toFixed(0) : '—';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <div className="bg-white/90 p-4 rounded-xl shadow-sm border border-rose-100 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-600 text-xs font-semibold dir-rtl">שכר (משובץ)</span>
          <i className="fas fa-dollar-sign text-rose-400 text-sm" />
        </div>
        <span className="text-xl font-black text-slate-800">
          ${kpis.totalCost.toLocaleString()}
        </span>
        <p className="mt-1 text-[10px] text-slate-500 dir-rtl">
          {kpis.filledShifts} משמרות
        </p>
      </div>

      <div className="bg-white/90 p-4 rounded-xl shadow-sm border border-green-100 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-600 text-xs font-semibold dir-rtl">יעד מכירות</span>
          <i className="fas fa-chart-line text-green-500 text-sm" />
        </div>
        <span className="text-xl font-black text-slate-800">
          ${kpis.totalTargetSales.toLocaleString()}
        </span>
        <p className="mt-1 text-[10px] text-slate-500 dir-rtl">
          {kpis.filledShifts > 0
            ? `צפי: $${kpis.projectedSales.toLocaleString()}`
            : 'שבץ עובדים לצפי'}
        </p>
      </div>

      <div className="bg-white/90 p-4 rounded-xl shadow-sm border border-purple-100 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-600 text-xs font-semibold dir-rtl">מכירות לש״ח שכר</span>
          <i className="fas fa-star text-yellow-500 text-sm" />
        </div>
        <span className="text-xl font-black text-slate-800">{salesRatio} : 1</span>
        <p className="mt-1 text-[10px] text-slate-500 dir-rtl">יחס שבועי</p>
      </div>

      <div className="bg-white/90 p-4 rounded-xl shadow-sm border border-cyan-100 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-600 text-xs font-semibold dir-rtl">כיסוי משמרות</span>
          <i className="fas fa-calendar-check text-cyan-500 text-sm" />
        </div>
        <span className="text-xl font-black text-slate-800">
          {kpis.filledShifts}/{kpis.totalShifts}
        </span>
        <div className="mt-1.5 bg-rose-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-rose-400 h-1.5 rounded-full transition-all"
            style={{ width: `${kpis.coveragePercentage}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-500 mt-1 dir-rtl">
          {openShifts > 0 ? `${openShifts} פתוחות` : 'מלא'}
        </p>
      </div>
    </div>
  );
};

export default KPIBanner;

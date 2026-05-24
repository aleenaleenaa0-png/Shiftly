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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-rose-500/10 border border-rose-200/50 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-600 text-sm font-semibold">Payroll (assigned shifts)</span>
          <i className="fas fa-dollar-sign text-rose-400" />
        </div>
        <span className="text-3xl font-black text-slate-800">
          ${kpis.totalCost.toLocaleString()}
        </span>
        <p className="mt-2 text-xs text-slate-500">
          Wages for {kpis.filledShifts} filled shift{kpis.filledShifts === 1 ? '' : 's'} this week
        </p>
      </div>

      <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-green-500/10 border border-green-200/50 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-600 text-sm font-semibold">Week sales target</span>
          <i className="fas fa-chart-line text-green-500" />
        </div>
        <span className="text-3xl font-black text-slate-800">
          ${kpis.totalTargetSales.toLocaleString()}
        </span>
        <p className="mt-2 text-xs text-slate-500">
          {kpis.filledShifts > 0
            ? `Expected from staff: $${kpis.projectedSales.toLocaleString()}`
            : 'Assign workers to see expected sales'}
        </p>
      </div>

      <div className="bg-gradient-to-br from-rose-100 to-purple-100 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-purple-500/20 border border-purple-300/50 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-700 text-sm font-semibold">Target sales per $1 payroll</span>
          <i className="fas fa-star text-yellow-500" />
        </div>
        <span className="text-3xl font-black text-slate-800">{salesRatio} : 1</span>
        <p className="mt-2 text-xs text-slate-600">
          For each $1 in wages, the week targets ${salesRatio} in sales
        </p>
      </div>

      <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-2xl shadow-xl shadow-cyan-500/10 border border-cyan-200/50 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-600 text-sm font-semibold">Shifts filled</span>
          <i className="fas fa-calendar-check text-cyan-500" />
        </div>
        <span className="text-3xl font-black text-slate-800">
          {kpis.filledShifts} / {kpis.totalShifts}
        </span>
        <div className="mt-2">
          <div className="flex-1 bg-rose-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-rose-400 via-purple-400 to-cyan-400 h-2 rounded-full transition-all"
              style={{ width: `${kpis.coveragePercentage}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {kpis.filledShifts} of {kpis.totalShifts} shifts have a worker
            {openShifts > 0 ? ` · ${openShifts} still open` : ''}
          </p>
        </div>
      </div>
    </div>
  );
};

export default KPIBanner;

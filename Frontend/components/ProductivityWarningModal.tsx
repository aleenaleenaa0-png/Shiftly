import React from 'react';
import {
  calculateProjectedThroughput,
  formatThroughput,
  getMinimumAcceptableThroughput,
  getShiftDurationHours,
  normalizeProductivityScore,
} from '../utils/throughput';
import { Employee, Shift } from '../types';

export interface ProductivityWarningContext {
  employee: Employee;
  shift: Shift;
}

interface ProductivityWarningModalProps {
  context: ProductivityWarningContext | null;
  onCancel: () => void;
  onProceed: () => void;
}

const MetricRow: React.FC<{
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}> = ({ label, value, hint, accent }) => (
  <div
    className={`px-4 py-3 border-t border-slate-100 flex flex-col gap-0.5 ${
      accent ? 'bg-amber-50/40' : ''
    }`}
  >
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </div>
    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </div>
);

const ProductivityWarningModal: React.FC<ProductivityWarningModalProps> = ({
  context,
  onCancel,
  onProceed,
}) => {
  if (!context) return null;

  const { employee, shift } = context;
  const hours = getShiftDurationHours(shift);
  const score = normalizeProductivityScore(employee.productivityScore);
  const required = shift.targetSales || 0;
  const projected = calculateProjectedThroughput(employee.productivityScore, shift);
  const minimum = getMinimumAcceptableThroughput(required);
  const shortfall = Math.max(0, minimum - projected);
  const shortfallPct = required > 0 ? ((shortfall / required) * 100).toFixed(1) : '0';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="productivity-warning-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-amber-200/80 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-5 border-b border-amber-100">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <i className="fas fa-chart-line text-amber-600 text-xl" aria-hidden />
            </div>
            <div>
              <h2 id="productivity-warning-title" className="text-lg font-bold text-slate-900">
                Workforce Efficiency Notice
              </h2>
              <p className="text-sm text-slate-600 mt-1">Throughput threshold not met — manager discretion required</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5 text-slate-700">
          <p className="text-sm leading-relaxed">
            Based on this employee&apos;s productivity index and the scheduled shift duration, their
            projected throughput falls below the shift&apos;s required minimum (90% of{' '}
            <span className="font-semibold">{formatThroughput(required)}</span>, allowing a 10%
            tolerance). Proceeding with this assignment may not meet operational efficiency standards
            for this shift.
          </p>

          <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
            <div className="bg-slate-50 px-4 py-2 font-bold text-slate-800 text-xs uppercase tracking-wider">
              Assignment details
            </div>
            <MetricRow label="Employee" value={employee.name} />
            <MetricRow
              label="Shift"
              value={`${shift.day} · ${shift.type} (${shift.startTime}–${shift.endTime})`}
            />
            <MetricRow label="Shift duration" value={`${hours} hours`} />
            <MetricRow label="Productivity index" value={`${score.toFixed(1)} / 10`} />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden text-sm">
            <div className="bg-amber-100/60 px-4 py-2 font-bold text-amber-900 text-xs uppercase tracking-wider">
              Throughput analysis
            </div>
            <MetricRow
              label="Projected throughput"
              value={formatThroughput(projected)}
              hint={`Productivity (${score.toFixed(1)}) × ${hours}h, aligned to shift target`}
              accent
            />
            <MetricRow label="Required throughput" value={formatThroughput(required)} />
            <MetricRow label="Minimum acceptable (90%)" value={formatThroughput(minimum)} />
            {shortfall > 0 && (
              <div className="px-4 py-3 border-t border-amber-200 bg-amber-100/30">
                <p className="text-amber-900 font-semibold text-sm">
                  Estimated shortfall: {formatThroughput(shortfall)} ({shortfallPct}% below
                  requirement)
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold hover:bg-white transition-colors"
          >
            Cancel assignment
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-md transition-colors"
          >
            Assign anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductivityWarningModal;

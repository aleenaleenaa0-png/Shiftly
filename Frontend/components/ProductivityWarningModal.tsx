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

const ThroughputBar: React.FC<{
  label: string;
  value: number;
  max: number;
  tone: 'projected' | 'minimum' | 'required';
}> = ({ label, value, max, tone }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const barClass =
    tone === 'projected'
      ? 'bg-amber-500'
      : tone === 'minimum'
        ? 'bg-orange-400'
        : 'bg-slate-400';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-500 font-medium">{label}</span>
        <span className="font-bold text-slate-800">{formatThroughput(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

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
  const shortfallPct = minimum > 0 ? Math.round((shortfall / minimum) * 100) : 0;

  const shiftLabel = `${shift.day} · ${shift.type} (${shift.startTime}–${shift.endTime})`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="productivity-warning-title"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-amber-200/80 overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <i className="fas fa-exclamation-triangle text-amber-600 text-sm" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="productivity-warning-title" className="text-sm font-bold text-slate-900 dir-rtl text-right">
              התראת יעילות
            </h2>
            <p className="text-[11px] text-slate-600 dir-rtl text-right">
              תפוקה צפויה מתחת לסף המינימום (90% מ-{formatThroughput(required)})
            </p>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3 text-xs text-slate-700">
          <p className="text-[11px] leading-relaxed dir-rtl text-right text-slate-600">
            <span className="font-bold text-slate-800">{employee.name}</span> — ציון {score.toFixed(1)}/10 ·{' '}
            {hours} שעות · יעד משמרת {formatThroughput(required)}. ניתן לשבץ בכל זאת לפי שיקול דעתך.
          </p>

          <p className="text-[10px] text-slate-500 dir-rtl text-right truncate" title={shiftLabel}>
            {shiftLabel}
          </p>

          <div className="space-y-2.5 pt-1">
            <ThroughputBar label="תפוקה צפויה" value={projected} max={required} tone="projected" />
            <ThroughputBar label="מינימום (90%)" value={minimum} max={required} tone="minimum" />
            <ThroughputBar label="יעד משמרת" value={required} max={required} tone="required" />
          </div>

          {shortfall > 0 && (
            <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 dir-rtl text-right">
              פער: {formatThroughput(shortfall)} ({shortfallPct}% מתחת למינימום)
            </p>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-white transition-colors"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="flex-1 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            שיבוץ בכל זאת
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductivityWarningModal;

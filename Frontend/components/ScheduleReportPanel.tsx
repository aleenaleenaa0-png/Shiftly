import React, { memo } from 'react';
import { ScheduleReport } from '../utils/scheduleReport';
import { formatDayHe, formatShiftTypeHe } from '../utils/labelsHe';

interface ScheduleReportPanelProps {
  report: ScheduleReport;
  onClose: () => void;
}

const healthLabels: Record<ScheduleReport['healthStatus'], { label: string; className: string }> = {
  good: { label: 'נראה טוב', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  attention: { label: 'דורש תשומת לב', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  critical: { label: 'נדרשת פעולה', className: 'bg-red-100 text-red-800 border-red-200' },
};

const statusStyles: Record<string, string> = {
  'filled-ok': 'bg-emerald-50 border-emerald-200 text-emerald-900',
  'filled-risk': 'bg-amber-50 border-amber-200 text-amber-900',
  empty: 'bg-slate-50 border-slate-200 text-slate-600',
  'no-workers': 'bg-rose-50 border-rose-200 text-rose-800',
};

const statusLabels: Record<string, string> = {
  'filled-ok': 'ביעד',
  'filled-risk': 'בסיכון',
  empty: 'ריק',
  'no-workers': 'אין זמינות',
};

const ScheduleReportPanel: React.FC<ScheduleReportPanelProps> = ({ report, onClose }) => {
  const health = healthLabels[report.healthStatus];

  return (
    <div className="mb-8 bg-white/95 backdrop-blur-xl border border-purple-200/60 rounded-2xl shadow-2xl overflow-hidden print:shadow-none dir-rtl">
      <div className="bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 px-6 py-4 flex items-center justify-between print:bg-slate-700">
        <div>
          <h3 className="text-white font-bold text-lg">דוח שבועי — Shiftly</h3>
          <p className="text-white/80 text-xs mt-0.5">נוצר: {report.generatedAt}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="text-white/90 hover:text-white text-sm px-3 py-1.5 rounded-lg bg-white/20 print:hidden"
          >
            הדפסה
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-white/90 hover:text-white p-2 rounded-lg print:hidden"
            aria-label="סגירת דוח"
          >
            <i className="fas fa-times" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto print:max-h-none text-right">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-bold border ${health.className}`}>
            {health.label}
          </span>
          <span className="text-sm text-slate-600">
            {report.coverage.filled} / {report.coverage.total} משמרות משובצות ({report.coverage.percentage}%)
          </span>
        </div>

        <section>
          <h4 className="text-sm font-bold text-slate-800 mb-2">בקצרה</h4>
          <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
            {report.executiveSummary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-100">
            <p className="text-xs font-semibold text-slate-600">הערכת שכר</p>
            <p className="text-2xl font-black text-slate-800">
              ${Math.round(report.totalLaborCost).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">משמרות משובצות בלבד</p>
          </div>
          <div className="p-4 rounded-xl bg-green-50 border border-green-100">
            <p className="text-xs font-semibold text-slate-600">יעד מכירות שבועי</p>
            <p className="text-2xl font-black text-slate-800">
              ${Math.round(report.totalTargetSales).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              צפי: ${Math.round(report.totalProjectedSales).toLocaleString()}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
            <p className="text-xs font-semibold text-slate-600">שיבוצים בסיכון</p>
            <p className="text-2xl font-black text-slate-800">{report.atRiskCount}</p>
            <p className="text-xs text-slate-500 mt-1">מתחת ל-90% מהיעד</p>
          </div>
          <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-100">
            <p className="text-xs font-semibold text-slate-600">משמרות פתוחות</p>
            <p className="text-2xl font-black text-slate-800">{report.openShiftCount}</p>
            <p className="text-xs text-slate-500 mt-1">טרם שובצו</p>
          </div>
        </div>

        <section>
          <h4 className="text-sm font-bold text-slate-800 mb-2">מידת מילוי הלוח</h4>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-400 via-purple-400 to-cyan-400 transition-all"
              style={{ width: `${report.coverage.percentage}%` }}
            />
          </div>
          <p className="text-xs text-slate-600 mt-1">
            {report.coverage.percentage}% — {report.coverage.filled} מתוך {report.coverage.total} משבצות
            {report.openShiftCount > 0
              ? ` · ${report.openShiftCount} עדיין פתוחות`
              : ' · הכל משובץ'}
          </p>
        </section>

        <section>
          <h4 className="text-sm font-bold text-slate-800 mb-3">מבט על השבוע</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="p-2 font-bold text-slate-600 text-right">יום</th>
                  <th className="p-2 font-bold text-slate-600 text-right">בוקר</th>
                  <th className="p-2 font-bold text-slate-600 text-right">ערב</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map(row => (
                  <tr key={row.day} className="border-t border-slate-100">
                    <td className="p-2 font-semibold text-slate-800">{formatDayHe(row.day)}</td>
                    {[row.morning, row.afternoon].map(cell => (
                      <td key={cell.slotNumber} className="p-2">
                        <div className={`rounded-lg border p-2 text-xs text-right ${statusStyles[cell.status]}`}>
                          <div className="font-bold">{statusLabels[cell.status]}</div>
                          {cell.employeeName && <p>{cell.employeeName}</p>}
                          <p className="opacity-80">
                            יעד ${cell.targetSales.toLocaleString()}
                            {cell.projectedSales != null &&
                              ` · צפי $${Math.round(cell.projectedSales).toLocaleString()}`}
                          </p>
                          {cell.availableCount > 0 &&
                            cell.status !== 'filled-ok' &&
                            cell.status !== 'filled-risk' && (
                              <p className="mt-1">{cell.availableCount} זמינים</p>
                            )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {report.atRisk.length > 0 && (
          <section>
            <h4 className="text-sm font-bold text-slate-800 mb-2">שיבוצים בסיכון</h4>
            <ul className="text-sm text-slate-700 space-y-1">
              {report.atRisk.map((item, i) => (
                <li key={i}>
                  <strong>{item.employeeName}</strong> — {formatDayHe(item.day)} {formatShiftTypeHe(item.type)}:
                  פער ~${item.shortfall.toLocaleString()} מהמינימום
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="text-sm font-bold text-slate-800 mb-2">מה לעשות הלאה</h4>
          <ul className="space-y-2">
            {report.actions.map((action, i) => (
              <li
                key={i}
                className={`text-sm px-3 py-2 rounded-lg border ${
                  action.priority === 'do-first'
                    ? 'bg-red-50 border-red-100 text-red-900'
                    : action.priority === 'consider'
                      ? 'bg-amber-50 border-amber-100 text-amber-900'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-900'
                }`}
              >
                {action.priority === 'do-first' && 'דחוף: '}
                {action.priority === 'consider' && 'לשקול: '}
                {action.priority === 'all-set' && 'הכל בסדר: '}
                {action.message}
              </li>
            ))}
          </ul>
        </section>

        {report.employees.length > 0 && (
          <section>
            <h4 className="text-sm font-bold text-slate-800 mb-2">שעות לפי עובד</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-600 border-b">
                    <th className="py-2 pl-4 text-right">שם</th>
                    <th className="py-2 pl-4 text-right">משמרות</th>
                    <th className="py-2 pl-4 text-right">שעות</th>
                    <th className="py-2 pl-4 text-right">שכר</th>
                    <th className="py-2 text-right">צפי מכירות</th>
                  </tr>
                </thead>
                <tbody>
                  {report.employees.map(emp => (
                    <tr key={emp.employeeId} className="border-b border-slate-50">
                      <td className="py-2 pl-4 font-medium">{emp.name}</td>
                      <td className="py-2 pl-4">{emp.shiftCount}</td>
                      <td className="py-2 pl-4">{emp.hours}</td>
                      <td className="py-2 pl-4">${Math.round(emp.laborCost).toLocaleString()}</td>
                      <td className="py-2">${Math.round(emp.projectedSales).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default memo(ScheduleReportPanel);

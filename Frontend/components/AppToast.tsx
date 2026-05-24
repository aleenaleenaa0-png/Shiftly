import React, { useEffect, useState } from 'react';
import type { NotifyDetail, NotifyType } from '../utils/notify';

const styles: Record<NotifyType, string> = {
  info: 'bg-slate-800 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
};

const AppToast: React.FC = () => {
  const [toast, setToast] = useState<NotifyDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NotifyDetail>).detail;
      if (!detail?.message) return;
      setToast({ message: detail.message, type: detail.type ?? 'info' });
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const type = toast.type ?? 'info';

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] max-w-md w-[calc(100%-2rem)] pointer-events-none"
      role="status"
    >
      <div
        className={`px-4 py-3 rounded-xl shadow-2xl text-sm font-medium dir-rtl text-right ${styles[type]}`}
      >
        {toast.message}
      </div>
    </div>
  );
};

export default AppToast;

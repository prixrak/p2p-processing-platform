'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { clsx } from 'clsx';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  add: (toast: Omit<Toast, 'id'>) => void;
  remove: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: String(++counter) }],
    })),
  remove: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));

export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().add({ type: 'success', message, duration }),
  error: (message: string, duration?: number) =>
    useToastStore.getState().add({ type: 'error', message, duration }),
  warning: (message: string, duration?: number) =>
    useToastStore.getState().add({ type: 'warning', message, duration }),
  info: (message: string, duration?: number) =>
    useToastStore.getState().add({ type: 'info', message, duration }),
};

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const typeStyles = {
  success: 'border-success/35 bg-success-muted text-text-primary',
  error: 'border-danger/40 bg-danger-muted text-text-primary',
  warning: 'border-warning/35 bg-warning-muted text-text-primary',
  info: 'border-accent/35 bg-accent-muted text-text-primary',
} as const;

const iconClass = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-accent',
} as const;

function ToastItem({ toast: t }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove);
  const Icon = iconMap[t.type];

  useEffect(() => {
    const timeout = setTimeout(() => remove(t.id), t.duration || 5_000);
    return () => clearTimeout(timeout);
  }, [t.id, t.duration, remove]);

  return (
    <div
      className={clsx(
        'pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-black/25',
        'animate-fade-in backdrop-blur-md',
        typeStyles[t.type],
      )}
    >
      <Icon className={clsx('h-5 w-5 shrink-0', iconClass[t.type])} />
      <p className="flex-1 text-sm font-medium text-text-primary">{t.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => remove(t.id)}
        className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

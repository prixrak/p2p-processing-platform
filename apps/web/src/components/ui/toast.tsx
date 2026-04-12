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
  success: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
  error: 'border-accent-red/30 bg-accent-red/10 text-accent-red',
  warning: 'border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow',
  info: 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue',
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
        'flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg shadow-black/20',
        'animate-slide-up',
        typeStyles[t.type],
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm font-medium text-text-primary">{t.message}</p>
      <button
        onClick={() => remove(t.id)}
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { Tooltip } from '@/components/ui/tooltip';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Omit or pass empty string for a headerless dialog (custom layout inside children). */
  title?: string;
  children: React.ReactNode;
  size?: ModalSize;
  className?: string;
  /** Overlay z-index when stacking dialogs (e.g. confirm above another modal). */
  overlayClassName?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  className,
  overlayClassName,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className={clsx(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
        overlayClassName,
      )}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={clsx(
          'relative w-full rounded-xl border border-border-primary bg-surface-secondary p-6 shadow-2xl',
          'max-h-[90vh] overflow-y-auto',
          sizeStyles[size],
          className,
        )}
      >
        {title ? (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <Tooltip content="Close (Esc)" side="bottom">
              <span className="inline-flex">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-tertiary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </Tooltip>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { Tooltip } from '@/components/ui/tooltip';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export type ModalVariant = 'centered' | 'fullscreen';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Omit or pass empty string for a headerless dialog (custom layout inside children). */
  title?: string;
  /** Optional muted line under the title (e.g. identifier email). */
  subtitle?: string;
  children: React.ReactNode;
  size?: ModalSize;
  /** `fullscreen` = edge-to-edge panel (fixed header, scrollable body). */
  variant?: ModalVariant;
  className?: string;
  /** Extra classes for the scrollable body (below header). */
  bodyClassName?: string;
  /** Overlay z-index when stacking dialogs (e.g. confirm above another modal). */
  overlayClassName?: string;
  /** When false, clicking the dimmed backdrop does not close the dialog (header X / explicit actions still call onClose). */
  closeOnBackdropClick?: boolean;
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
  subtitle,
  children,
  size = 'md',
  variant = 'centered',
  className,
  bodyClassName,
  overlayClassName,
  closeOnBackdropClick = true,
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

  const fullscreen = variant === 'fullscreen';

  /** Render at document body so the backdrop is not clipped by shell `overflow` / layout ancestors. */
  return createPortal(
    <div
      ref={overlayRef}
      className={clsx(
        'fixed inset-0 z-50 min-h-dvh w-full',
        fullscreen
          ? 'flex flex-col bg-overlay backdrop-blur-[2px]'
          : 'flex items-center justify-center bg-overlay p-4 backdrop-blur-sm',
        overlayClassName,
      )}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={clsx(
          'relative flex flex-col overflow-hidden bg-surface-secondary',
          fullscreen
            ? 'h-full w-full max-h-full shrink-0 rounded-none border-0 shadow-none'
            : clsx(
                'w-full shrink-0 rounded-xl border border-border-primary shadow-2xl',
                'h-fit max-h-[90vh]',
                sizeStyles[size],
              ),
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <>
            <div
              className={clsx(
                'flex shrink-0 items-start justify-between gap-4 border-b border-border-primary px-6',
                fullscreen ? 'py-5' : 'py-4',
              )}
            >
              <div className="min-w-0 flex-1">
                <h2
                  className={clsx(
                    'font-semibold text-text-primary',
                    fullscreen ? 'text-xl' : 'text-lg',
                  )}
                >
                  {title}
                </h2>
                {subtitle ? (
                  <p className="mt-1 truncate text-sm text-text-muted">{subtitle}</p>
                ) : null}
              </div>
              <Tooltip content="Close (Esc)" side="bottom">
                <span className="inline-flex shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="cursor-pointer rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-tertiary hover:text-text-primary"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </span>
              </Tooltip>
            </div>
            <div
              className={clsx(
                'min-h-0 flex-1 overflow-y-auto px-6',
                fullscreen ? 'py-8' : 'py-4',
                bodyClassName,
              )}
            >
              {children}
            </div>
          </>
        ) : (
          <div
            className={clsx(
              'overflow-y-auto',
              fullscreen ? 'h-full max-h-full p-6' : 'max-h-[90vh] px-6 py-5',
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

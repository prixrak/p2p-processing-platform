'use client';

import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export type ConfirmDialogTone = 'default' | 'danger';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  loading,
  onConfirm,
  confirmDisabled,
  icon,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  loading?: boolean;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /** Optional icon beside the title (defaults to warning for danger tone). */
  icon?: ReactNode;
  /** Extra body below the description (e.g. file upload). */
  children?: ReactNode;
}) {
  const resolvedIcon =
    icon ??
    (tone === 'danger' ? <AlertTriangle className="h-5 w-5 text-accent-red shrink-0" /> : null);

  return (
    <Modal
      open={open}
      onClose={() => !loading && onOpenChange(false)}
      size="sm"
      overlayClassName="z-[60]"
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          {resolvedIcon ? <span className="mt-0.5">{resolvedIcon}</span> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-lg font-semibold text-text-primary leading-snug">{title}</h2>
            {description ? (
              <div className="text-sm text-text-secondary leading-relaxed">{description}</div>
            ) : null}
            {children ? <div className="pt-2">{children}</div> : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            disabled={loading || confirmDisabled}
            className={clsx(tone === 'danger' && 'min-w-[7rem]')}
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

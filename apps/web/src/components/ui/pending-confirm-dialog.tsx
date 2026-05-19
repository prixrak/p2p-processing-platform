'use client';

import type { ReactNode } from 'react';
import { ConfirmDialog, type ConfirmDialogTone } from '@/components/ui/confirm-dialog';

export type PendingConfirmCopy = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
};

export function PendingConfirmDialog<T>({
  pending,
  onOpenChange,
  getCopy,
  loading,
  onConfirm,
}: {
  pending: T | null;
  onOpenChange: (open: boolean) => void;
  getCopy: (item: T) => PendingConfirmCopy;
  loading?: boolean;
  onConfirm: (item: T) => void;
}) {
  const copy = pending ? getCopy(pending) : null;

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !loading) onOpenChange(false);
      }}
      title={copy?.title ?? ''}
      description={copy?.description}
      confirmLabel={copy?.confirmLabel ?? 'Confirm'}
      cancelLabel={copy?.cancelLabel ?? 'Cancel'}
      tone={copy?.tone ?? 'default'}
      loading={loading}
      onConfirm={() => {
        if (pending) onConfirm(pending);
      }}
    />
  );
}

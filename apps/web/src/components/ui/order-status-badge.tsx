'use client';

import {
  Activity,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  FileWarning,
  HelpCircle,
  Hourglass,
  Inbox,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { payinStatusVariant, payoutStatusVariant } from '@/lib/status-helpers';
import { payinStatusLabel, payoutStatusLabel } from '@/lib/order-status-ui';

const payinStatusIcon: Record<string, LucideIcon> = {
  PENDING: Hourglass,
  NEW: Inbox,
  VERIFIED: ShieldCheck,
  PAID: CircleDollarSign,
  UNDERPAID: TrendingDown,
  OVERPAID: TrendingUp,
  APPEAL: Scale,
  CANCELED: Ban,
  UPLOAD_FAILED: FileWarning,
  NO_REQUISITE: HelpCircle,
  PROCESSING: Activity,
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
};

const payoutStatusIcon: Record<string, LucideIcon> = {
  PENDING: Hourglass,
  NEW: Inbox,
  PROCESSING: Activity,
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  UPLOAD_FAILED: FileWarning,
  NO_REQUISITE: HelpCircle,
  CANCELED: Ban,
};

function fallbackIcon(): LucideIcon {
  return Clock;
}

export function PayinOrderStatusBadge({
  status,
  label,
}: {
  status: string;
  /** When set (e.g. from `next-intl`), overrides the default title-cased enum label. */
  label?: string;
}) {
  const variant = payinStatusVariant[status] ?? 'default';
  const Icon = payinStatusIcon[status] ?? fallbackIcon();
  return (
    <Badge variant={variant} leadingIcon={<Icon strokeWidth={2} />}>
      {label ?? payinStatusLabel(status)}
    </Badge>
  );
}

export function PayoutOrderStatusBadge({ status }: { status: string }) {
  const variant = payoutStatusVariant[status] ?? 'default';
  const Icon = payoutStatusIcon[status] ?? fallbackIcon();
  return (
    <Badge variant={variant} leadingIcon={<Icon strokeWidth={2} />}>
      {payoutStatusLabel(status)}
    </Badge>
  );
}

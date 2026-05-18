'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { PayInOrderStatus, PayOutOrderStatus } from '@p2p/shared';
import { payinStatusLabel, payoutStatusLabel } from '@/lib/order-status-ui';
import { formatDateTime } from '@/lib/utils';

const ACCENT = 'var(--color-accent)';
const SUCCESS = 'var(--color-success)';
const BORDER = 'var(--color-border-secondary)';
const MUTED = 'var(--color-text-muted)';
const SURFACE = 'var(--color-surface-elevated)';
const BORDER_PRIMARY = 'var(--color-border-primary)';
const TEXT_SECONDARY = 'var(--color-text-secondary)';

export function TraderVolumeChart({
  data,
  currency,
  empty,
  payInName = 'Pay-In',
  payOutName = 'Pay-Out',
  emptyMessage = 'No volume data for this period',
}: {
  data: Array<{
    date: string;
    payinVolume: number;
    payoutVolume: number;
    totalVolume: number;
  }>;
  currency: string;
  empty: boolean;
  payInName?: string;
  payOutName?: string;
  emptyMessage?: string;
}) {
  if (empty) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border-secondary">
        <p className="text-sm text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateTime(new Date(`${d.date}T12:00:00`)),
  }));

  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} strokeOpacity={0.6} />
          <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} />
          <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: SURFACE,
              border: `1px solid ${BORDER_PRIMARY}`,
              borderRadius: 8,
            }}
            labelStyle={{ color: TEXT_SECONDARY }}
            formatter={(value, name) => {
              const raw = value ?? 0;
              const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
              const label = name === 'payinVolume' ? payInName : payOutName;
              return [
                `${Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0'} ${currency}`,
                String(label),
              ];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="payinVolume" name={payInName} stackId="vol" fill={ACCENT} />
          <Bar
            dataKey="payoutVolume"
            name={payOutName}
            stackId="vol"
            fill={SUCCESS}
            radius={[4, 4, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function statusBarData(
  enumValues: readonly string[],
  counts: Record<string, number>,
  labelFn: (s: string) => string,
) {
  return enumValues.map((status) => {
    const key = status.toLowerCase();
    return {
      key: status,
      label: labelFn(status),
      count: counts[key] ?? 0,
    };
  });
}

export function TraderPayinStatusChart({
  counts,
  statusLabel = payinStatusLabel,
  emptyMessage = 'No Pay-In orders in this period',
  ordersAxisLabel = 'Orders',
}: {
  counts: Record<string, number>;
  statusLabel?: (s: string) => string;
  emptyMessage?: string;
  ordersAxisLabel?: string;
}) {
  const data = statusBarData(
    Object.values(PayInOrderStatus),
    counts,
    statusLabel,
  );

  const hasAny = data.some((d) => d.count > 0);
  if (!hasAny) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border-secondary">
        <p className="text-sm text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} strokeOpacity={0.6} />
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 10 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={56}
          />
          <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: SURFACE,
              border: `1px solid ${BORDER_PRIMARY}`,
              borderRadius: 8,
            }}
            formatter={(value) => [String(value ?? 0), ordersAxisLabel]}
          />
          <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} name={ordersAxisLabel} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TraderPayoutStatusChart({
  counts,
  statusLabel = payoutStatusLabel,
  emptyMessage = 'No Pay-Out orders in this period',
  ordersAxisLabel = 'Orders',
}: {
  counts: Record<string, number>;
  statusLabel?: (s: string) => string;
  emptyMessage?: string;
  ordersAxisLabel?: string;
}) {
  const data = statusBarData(
    Object.values(PayOutOrderStatus),
    counts,
    statusLabel,
  );

  const hasAny = data.some((d) => d.count > 0);
  if (!hasAny) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border-secondary">
        <p className="text-sm text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} strokeOpacity={0.6} />
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 10 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={56}
          />
          <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: SURFACE,
              border: `1px solid ${BORDER_PRIMARY}`,
              borderRadius: 8,
            }}
            formatter={(value) => [String(value ?? 0), ordersAxisLabel]}
          />
          <Bar dataKey="count" fill={SUCCESS} radius={[4, 4, 0, 0]} name={ordersAxisLabel} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Plus, ReceiptText, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { traderKeys } from '@/lib/query-keys';
import { WALLET_HIGHLIGHT_PRESETS } from '@/lib/surface-ring';
import { cn, formatCurrency } from '@/lib/utils';
import { currencyCodeFromUnknown } from '@/lib/currency-code';

/** GET /api/traders/me/balances — Prisma `TraderBalance` rows (nested currency from include) */
interface TraderMeBalanceRow {
  id: string;
  traderId: string;
  currency: unknown;
  amount: string | number;
}

interface UsdtWalletSummary {
  balance_usdt: number;
  overdraft_limit_usdt: number;
}

const CRYPTO_CURRENCIES = new Set([
  'USDT',
  'USDC',
  'BTC',
  'ETH',
  'TRX',
  'TON',
  'LTC',
  'BNB',
  'SOL',
]);

function isCryptoCurrency(code: string): boolean {
  return CRYPTO_CURRENCIES.has(code.toUpperCase());
}

function parseAmount(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function TraderDashboardWalletListSection() {
  const t = useTranslations('Trader.Wallet');
  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: traderKeys.balancesMe(),
    queryFn: () => api.get<TraderMeBalanceRow[]>(internalPaths.traderMeBalances),
  });

  const { data: usdtWallet, isLoading: usdtLoading } = useQuery({
    queryKey: traderKeys.usdtWallet(),
    queryFn: () => api.get<UsdtWalletSummary>(internalPaths.traderUsdtWallet),
  });

  const loading = balancesLoading || usdtLoading;

  const wallets = useMemo(() => {
    const rows = [...(balances ?? [])];
    const upperCodes = new Set(
      rows.map((r) => currencyCodeFromUnknown(r.currency).toUpperCase()).filter(Boolean),
    );
    if (usdtWallet && !upperCodes.has('USDT')) {
      rows.push({
        id: 'synthetic-usdt',
        traderId: '',
        currency: 'USDT',
        amount: usdtWallet.balance_usdt,
      });
    }
    return rows
      .map((row) => {
        const currency = currencyCodeFromUnknown(row.currency).toUpperCase();
        const amount =
          currency === 'USDT' && usdtWallet ? usdtWallet.balance_usdt : parseAmount(row.amount);
        return {
          currency,
          amount,
          isCrypto: currency.length > 0 && isCryptoCurrency(currency),
          overdraftUsd:
            currency === 'USDT' && usdtWallet ? usdtWallet.overdraft_limit_usdt : undefined,
        };
      })
      .filter((w) => w.currency.length > 0)
      .sort((a, b) => {
        if (a.isCrypto !== b.isCrypto) return a.isCrypto ? 1 : -1;
        return a.currency.localeCompare(b.currency);
      });
  }, [balances, usdtWallet]);

  return (
    <section className="rounded-xl border border-border-primary bg-bg-secondary/60 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-accent-blue" />
        <h2 className="text-lg font-semibold text-text-primary">{t('title')}</h2>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-1">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="min-w-[min(100%,280px)] h-40 shrink-0 animate-pulse rounded-2xl bg-white/5"
            />
          ))}
        </div>
      ) : wallets.length === 0 ? (
        <p className="text-sm text-text-muted">{t('empty')}</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-1 scroll-smooth">
          {wallets.map((w, idx) => {
            const preset = WALLET_HIGHLIGHT_PRESETS[idx % WALLET_HIGHLIGHT_PRESETS.length]!;
            return (
              <article
                key={w.currency}
                className={cn(
                  'relative min-w-[min(100%,300px)] shrink-0 overflow-hidden rounded-2xl p-4 text-white shadow-lg',
                  preset.gradient,
                )}
              >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl"
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <span className="text-sm font-semibold tracking-wide text-white/95">{w.currency}</span>
                <span className="text-right text-lg font-bold tabular-nums leading-tight">
                  {formatCurrency(w.amount, w.currency)}
                </span>
              </div>

              {w.overdraftUsd !== undefined ? (
                <p className="relative mt-2 text-xs text-white/75">
                  {t('creditLimit')}{' '}
                  <span className="font-mono tabular-nums text-white/95">
                    {formatCurrency(w.overdraftUsd, w.currency)}
                  </span>
                </p>
              ) : null}

              <div
                className={cn(
                  'relative flex flex-wrap items-center gap-2',
                  w.overdraftUsd !== undefined ? 'mt-3' : 'mt-2',
                )}
              >
                <span
                  className={cn(
                    'inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    w.isCrypto ? 'bg-white/20 text-white' : 'bg-white/15 text-white/95',
                  )}
                >
                  {w.isCrypto ? t('crypto') : t('fiat')}
                </span>
              </div>

              <div className="relative mt-4 flex items-end justify-between gap-2">
                <div>
                  {w.currency === 'USDT' ? (
                    <Link
                      href="/trader/balance#wallet-deposit-instructions"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition hover:bg-white/25"
                      aria-label={t('topUpUsdt')}
                      title={t('topUpUsdt')}
                    >
                      <Plus className="h-5 w-5" />
                    </Link>
                  ) : (
                    <span className="inline-block w-9" aria-hidden />
                  )}
                </div>
                <Link
                  href="/trader/balance"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/25"
                >
                  <ReceiptText className="h-4 w-4 shrink-0" />
                  {t('transactions')}
                </Link>
              </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

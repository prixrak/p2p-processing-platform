'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, ReceiptText, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { cn, formatCurrency } from '@/lib/utils';

/** GET /api/traders/me/balances — Prisma `TraderBalance` rows */
interface TraderMeBalanceRow {
  id: string;
  traderId: string;
  currency: string;
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
  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ['trader', 'balances', 'me'],
    queryFn: () => api.get<TraderMeBalanceRow[]>(internalPaths.traderMeBalances),
  });

  const { data: usdtWallet, isLoading: usdtLoading } = useQuery({
    queryKey: ['trader', 'usdt-wallet'],
    queryFn: () => api.get<UsdtWalletSummary>(internalPaths.traderUsdtWallet),
  });

  const loading = balancesLoading || usdtLoading;

  const wallets = useMemo(() => {
    const rows = [...(balances ?? [])];
    const upperCodes = new Set(rows.map((r) => r.currency.toUpperCase()));
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
        const currency = row.currency.toUpperCase();
        const amount =
          currency === 'USDT' && usdtWallet ? usdtWallet.balance_usdt : parseAmount(row.amount);
        return {
          currency,
          amount,
          isCrypto: isCryptoCurrency(currency),
          overdraftUsd:
            currency === 'USDT' && usdtWallet ? usdtWallet.overdraft_limit_usdt : undefined,
        };
      })
      .sort((a, b) => {
        if (a.isCrypto !== b.isCrypto) return a.isCrypto ? 1 : -1;
        return a.currency.localeCompare(b.currency);
      });
  }, [balances, usdtWallet]);

  return (
    <section className="rounded-xl border border-border-primary bg-bg-secondary/60 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-accent-blue" />
        <h2 className="text-lg font-semibold text-text-primary">Wallet list</h2>
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
        <p className="text-sm text-text-muted">No currency balances on file yet.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-1 scroll-smooth">
          {wallets.map((w) => (
            <article
              key={w.currency}
              className={cn(
                'relative min-w-[min(100%,300px)] shrink-0 overflow-hidden rounded-2xl p-4 text-white shadow-lg',
                'bg-gradient-to-br from-sky-500 via-blue-600 to-blue-950',
                'ring-1 ring-white/10',
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
                  Credit limit (overdraft):{' '}
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
                  {w.isCrypto ? 'Crypto' : 'Fiat'}
                </span>
              </div>

              <div className="relative mt-4 flex items-end justify-between gap-2">
                <div>
                  {w.currency === 'USDT' ? (
                    <Link
                      href="/trader/balance#wallet-deposit-instructions"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition hover:bg-white/25"
                      aria-label="Top up USDT"
                      title="Top up USDT"
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
                  <ReceiptText className="h-3.5 w-3.5 shrink-0" />
                  Transactions
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

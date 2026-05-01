import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  PAYIN_ORDER_REALTIME_EVENT_TYPE,
  PAYOUT_ORDER_REALTIME_EVENT_TYPE,
  type PayinOrderRealtimeEvent,
  type PayOutOrderRealtimeEvent,
} from '@p2p/shared';
import { getToken } from '@/lib/auth';
import { internalPaths } from '@/lib/internal-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const RECONNECT_MS = 5000;

/**
 * Reads an SSE response until the stream closes or `signal` aborts.
 * Parses `data:` lines (single-line JSON payloads).
 */
export async function consumeSseStream(
  path: string,
  options: {
    onMessage: (data: string) => void;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  },
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...options.headers,
    },
    signal: options.signal,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`SSE failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('SSE: no response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        if (!line.startsWith('data:')) continue;
        const payload = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
        options.onMessage(payload.trim());
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Subscribes to Pay-In updates for the logged-in trader (Bearer token).
 * Invalidates list and dashboard queries when an event arrives; reconnects on disconnect.
 */
export function usePayinTraderRealtime(queryClient: QueryClient): void {
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        const token = getToken();
        if (!token) break;

        try {
          await consumeSseStream(internalPaths.traderPayinStream, {
            signal: ac.signal,
            headers: { Authorization: `Bearer ${token}` },
            onMessage: (raw) => {
              try {
                const evt = JSON.parse(raw) as PayinOrderRealtimeEvent;
                if (evt.type === PAYIN_ORDER_REALTIME_EVENT_TYPE) {
                  queryClient.invalidateQueries({ queryKey: ['trader', 'payin-orders'] });
                  queryClient.invalidateQueries({ queryKey: ['trader', 'balances', 'me'] });
                  queryClient.invalidateQueries({ queryKey: ['trader', 'usdt-wallet'] });
                  queryClient.invalidateQueries({ queryKey: ['trader', 'dashboard-stats'] });
                }
              } catch {
                /* malformed line */
              }
            },
          });
        } catch (e) {
          if ((e as Error).name === 'AbortError' || ac.signal.aborted) break;
        }

        if (cancelled || ac.signal.aborted) break;
        try {
          await sleep(RECONNECT_MS, ac.signal);
        } catch {
          break;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [queryClient]);
}

/**
 * Subscribes to Pay-Out pool + order updates for standard traders or pool B specialists.
 */
export function usePayoutCabinetRealtime(
  queryClient: QueryClient,
  variant: 'standard' | 'specialist',
): void {
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    const streamPath =
      variant === 'specialist' ? internalPaths.payoutSpecialistStream : internalPaths.traderPayoutStream;
    const qk = variant === 'specialist' ? 'payout-trader' : 'trader';

    const run = async () => {
      while (!cancelled) {
        const token = getToken();
        if (!token) break;

        try {
          await consumeSseStream(streamPath, {
            signal: ac.signal,
            headers: { Authorization: `Bearer ${token}` },
            onMessage: (raw) => {
              try {
                const evt = JSON.parse(raw) as PayOutOrderRealtimeEvent;
                if (evt.type === PAYOUT_ORDER_REALTIME_EVENT_TYPE) {
                  void queryClient.invalidateQueries({ queryKey: [qk, 'payout-orders'] });
                  void queryClient.invalidateQueries({ queryKey: [qk, 'payout-pool'] });
                  if (variant === 'specialist') {
                    void queryClient.invalidateQueries({ queryKey: [qk, 'summary'] });
                  } else {
                    void queryClient.invalidateQueries({ queryKey: ['trader', 'balances', 'me'] });
                    void queryClient.invalidateQueries({ queryKey: ['trader', 'usdt-wallet'] });
                    void queryClient.invalidateQueries({ queryKey: ['trader', 'dashboard-stats'] });
                  }
                  void queryClient.refetchQueries({ queryKey: [qk, 'payout-orders'] });
                  void queryClient.refetchQueries({ queryKey: [qk, 'payout-pool'] });
                }
              } catch {
                /* malformed line */
              }
            },
          });
        } catch (e) {
          if ((e as Error).name === 'AbortError' || ac.signal.aborted) break;
        }

        if (cancelled || ac.signal.aborted) break;
        try {
          await sleep(RECONNECT_MS, ac.signal);
        } catch {
          break;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [queryClient, variant]);
}

export function usePayOutTraderRealtime(queryClient: QueryClient): void {
  usePayoutCabinetRealtime(queryClient, 'standard');
}

export function usePayOutSpecialistRealtime(queryClient: QueryClient): void {
  usePayoutCabinetRealtime(queryClient, 'specialist');
}

/**
 * Trader cabinet: live TRC-20 deposit credits (custodial / monitored addresses).
 */
export function useTraderWalletDepositRealtime(queryClient: QueryClient): void {
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        const token = getToken();
        if (!token) break;

        try {
          await consumeSseStream(internalPaths.traderWalletEventsStream, {
            signal: ac.signal,
            headers: { Authorization: `Bearer ${token}` },
            onMessage: (raw) => {
              try {
                const parsed = JSON.parse(raw) as { type?: string };
                if (parsed?.type === 'deposit') {
                  void queryClient.invalidateQueries({ queryKey: ['trader', 'usdt-wallet'] });
                  void queryClient.invalidateQueries({ queryKey: ['trader', 'balances', 'me'] });
                  void queryClient.invalidateQueries({ queryKey: ['trader', 'balance-transactions'] });
                }
              } catch {
                /* malformed line */
              }
            },
          });
        } catch (e) {
          if ((e as Error).name === 'AbortError' || ac.signal.aborted) break;
        }

        if (cancelled || ac.signal.aborted) break;
        try {
          await sleep(RECONNECT_MS, ac.signal);
        } catch {
          break;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [queryClient]);
}

/**
 * Merchant cabinet: Pay-In + Pay-Out order updates (Bearer token).
 */
export function useMerchantOrdersRealtime(queryClient: QueryClient): void {
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        const token = getToken();
        if (!token) break;

        try {
          await consumeSseStream(internalPaths.merchantOrdersStream, {
            signal: ac.signal,
            headers: { Authorization: `Bearer ${token}` },
            onMessage: (raw) => {
              try {
                const parsed = JSON.parse(raw) as PayinOrderRealtimeEvent | PayOutOrderRealtimeEvent;
                if (
                  parsed.type === PAYIN_ORDER_REALTIME_EVENT_TYPE ||
                  parsed.type === PAYOUT_ORDER_REALTIME_EVENT_TYPE
                ) {
                  void queryClient.invalidateQueries({ queryKey: ['merchant', 'orders'] });
                  void queryClient.invalidateQueries({ queryKey: ['merchant', 'stats'] });
                  void queryClient.invalidateQueries({ queryKey: ['merchant', 'balances'] });
                  void queryClient.invalidateQueries({ queryKey: ['merchant', 'analytics'] });
                }
              } catch {
                /* malformed line */
              }
            },
          });
        } catch (e) {
          if ((e as Error).name === 'AbortError' || ac.signal.aborted) break;
        }

        if (cancelled || ac.signal.aborted) break;
        try {
          await sleep(RECONNECT_MS, ac.signal);
        } catch {
          break;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [queryClient]);
}

/**
 * Public Pay-In page: subscribe to order-scoped SSE and run `onUpdate` on each event.
 */
export function usePayinOrderRealtime(
  orderId: string,
  enabled: boolean,
  onUpdate: () => void,
): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        try {
          await consumeSseStream(internalPaths.payOrderStream(orderId), {
            signal: ac.signal,
            onMessage: () => {
              onUpdateRef.current();
            },
          });
        } catch (e) {
          if ((e as Error).name === 'AbortError' || ac.signal.aborted) break;
        }

        if (cancelled || ac.signal.aborted) break;
        try {
          await sleep(RECONNECT_MS, ac.signal);
        } catch {
          break;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [orderId, enabled]);
}

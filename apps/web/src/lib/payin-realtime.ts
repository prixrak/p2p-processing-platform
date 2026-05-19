import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  PAYIN_ORDER_REALTIME_EVENT_TYPE,
  PAYOUT_ORDER_REALTIME_EVENT_TYPE,
  TELEGRAM_LINKED_REALTIME_EVENT_TYPE,
  type PayinOrderRealtimeEvent,
  type PayOutOrderRealtimeEvent,
  type TelegramLinkedRealtimeEvent,
} from '@p2p/shared';
import { getToken } from '@/lib/auth';
import { internalPaths } from '@/lib/internal-api';
import {
  adminKeys,
  merchantKeys,
  ownerKeys,
  payoutCabinetKeys,
  specialistCabinetKeys,
  supportKeys,
  type PayoutCabinetScope,
  traderKeys,
} from '@/lib/query-keys';
import { useDocumentVisible } from '@/lib/use-document-visible';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const RECONNECT_MS = 5000;

/** Debounce realtime bursts so idle queries share one refresh instead of starving the network queue. */
const INVALIDATE_DEBOUNCE_MS = 200;

function createDebouncer(ms: number) {
  let id: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(fn: () => void) {
      if (id !== null) clearTimeout(id);
      id = setTimeout(() => {
        id = null;
        fn();
      }, ms);
    },
    dispose() {
      if (id !== null) clearTimeout(id);
      id = null;
    },
  };
}

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

type UseSseSubscriptionOptions = {
  path: string;
  enabled?: boolean;
  /** When true, skip streaming until a Bearer token exists (cabinet SSE). */
  requireAuth?: boolean;
  onMessage: (raw: string) => void;
  /** Fires when this tab becomes visible again after being backgrounded. */
  onVisibleAgain?: () => void;
};

/**
 * Long-lived SSE loop with reconnect. Pauses while the tab is hidden so a second
 * tab in the same browser is not starved by HTTP/1.1 per-origin connection limits.
 */
function useSseSubscription({
  path,
  enabled = true,
  requireAuth = false,
  onMessage,
  onVisibleAgain,
}: UseSseSubscriptionOptions): void {
  const visible = useDocumentVisible();
  const streaming = enabled && visible;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onVisibleAgainRef = useRef(onVisibleAgain);
  onVisibleAgainRef.current = onVisibleAgain;
  const prevStreamingRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (prevStreamingRef.current === null) {
      prevStreamingRef.current = streaming;
      return;
    }
    if (!prevStreamingRef.current && streaming) {
      onVisibleAgainRef.current?.();
    }
    prevStreamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    if (!streaming) return;

    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        const headers: Record<string, string> = {};
        if (requireAuth) {
          const token = getToken();
          if (!token) break;
          headers.Authorization = `Bearer ${token}`;
        }

        try {
          await consumeSseStream(path, {
            signal: ac.signal,
            headers,
            onMessage: (raw) => onMessageRef.current(raw),
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
  }, [streaming, path, requireAuth]);
}

/**
 * Subscribes to Pay-In updates for the logged-in trader (Bearer token).
 * Invalidates list and dashboard queries when an event arrives; reconnects on disconnect.
 */
export function usePayinTraderRealtime(queryClient: QueryClient): void {
  const invalidateDebouncer = useRef(createDebouncer(INVALIDATE_DEBOUNCE_MS));

  const invalidateAll = () => {
    invalidateDebouncer.current.schedule(() => {
      queryClient.invalidateQueries({ queryKey: traderKeys.payinOrdersScope });
      queryClient.invalidateQueries({ queryKey: traderKeys.balancesMe() });
      queryClient.invalidateQueries({ queryKey: traderKeys.usdtWallet() });
      queryClient.invalidateQueries({ queryKey: traderKeys.dashboardStats() });
      queryClient.invalidateQueries({ queryKey: traderKeys.requisiteGroupsScope });
      queryClient.invalidateQueries({ queryKey: traderKeys.payinAssignRanges });
    });
  };

  useEffect(() => () => invalidateDebouncer.current.dispose(), []);

  useSseSubscription({
    path: internalPaths.traderPayinStream,
    requireAuth: true,
    onVisibleAgain: invalidateAll,
    onMessage: (raw) => {
      try {
        const evt = JSON.parse(raw) as PayinOrderRealtimeEvent;
        if (evt.type === PAYIN_ORDER_REALTIME_EVENT_TYPE) {
          invalidateAll();
        }
      } catch {
        /* malformed line */
      }
    },
  });
}

/**
 * Subscribes to Pay-Out pool + order updates for standard traders or pool B specialists.
 */
export function usePayoutCabinetRealtime(
  queryClient: QueryClient,
  variant: 'standard' | 'specialist',
): void {
  const streamPath =
    variant === 'specialist' ? internalPaths.payoutSpecialistStream : internalPaths.traderPayoutStream;
  const qk: PayoutCabinetScope = variant === 'specialist' ? 'payout-trader' : 'trader';
  const invalidateDebouncer = useRef(createDebouncer(INVALIDATE_DEBOUNCE_MS));

  const invalidateAll = () => {
    invalidateDebouncer.current.schedule(() => {
      void queryClient.invalidateQueries({
        queryKey: payoutCabinetKeys.payoutOrdersScope(qk),
      });
      void queryClient.invalidateQueries({
        queryKey: [qk, 'payout-pool'],
      });
      if (variant === 'specialist') {
        void queryClient.invalidateQueries({
          queryKey: payoutCabinetKeys.specialistSummary(),
        });
      } else {
        void queryClient.invalidateQueries({ queryKey: traderKeys.balancesMe() });
        void queryClient.invalidateQueries({ queryKey: traderKeys.usdtWallet() });
        void queryClient.invalidateQueries({ queryKey: traderKeys.dashboardStats() });
      }
    });
  };

  useEffect(() => () => invalidateDebouncer.current.dispose(), []);

  useSseSubscription({
    path: streamPath,
    requireAuth: true,
    onVisibleAgain: invalidateAll,
    onMessage: (raw) => {
      try {
        const evt = JSON.parse(raw) as PayOutOrderRealtimeEvent;
        if (evt.type === PAYOUT_ORDER_REALTIME_EVENT_TYPE) {
          invalidateAll();
        }
      } catch {
        /* malformed line */
      }
    },
  });
}

export function usePayOutTraderRealtime(queryClient: QueryClient): void {
  usePayoutCabinetRealtime(queryClient, 'standard');
}

export function usePayOutSpecialistRealtime(queryClient: QueryClient): void {
  usePayoutCabinetRealtime(queryClient, 'specialist');
}

/** Trader or Pay-Out specialist cabinet: push when Telegram bot linking completes. */
export function useTelegramCabinetRealtime(
  queryClient: QueryClient,
  variant: 'trader' | 'specialist',
): void {
  const streamPath =
    variant === 'specialist'
      ? internalPaths.payoutTraderTelegramStream
      : internalPaths.telegramStream;
  const queryKey =
    variant === 'specialist' ? specialistCabinetKeys.telegram() : traderKeys.telegram();

  const applyLinked = (evt: TelegramLinkedRealtimeEvent) => {
    queryClient.setQueryData(queryKey, (current: Record<string, unknown> | undefined) =>
      current
        ? {
            ...current,
            chatId: evt.chatId,
            isActive: evt.isActive,
          }
        : current,
    );
    void queryClient.invalidateQueries({ queryKey });
  };

  useSseSubscription({
    path: streamPath,
    requireAuth: true,
    onVisibleAgain: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onMessage: (raw) => {
      try {
        const evt = JSON.parse(raw) as TelegramLinkedRealtimeEvent;
        if (evt.type === TELEGRAM_LINKED_REALTIME_EVENT_TYPE) {
          applyLinked(evt);
        }
      } catch {
        /* malformed line */
      }
    },
  });
}

export function useTraderTelegramRealtime(queryClient: QueryClient): void {
  useTelegramCabinetRealtime(queryClient, 'trader');
}

export function usePayoutTraderTelegramRealtime(queryClient: QueryClient): void {
  useTelegramCabinetRealtime(queryClient, 'specialist');
}

/**
 * Trader cabinet: live TRC-20 deposit credits (custodial / monitored addresses).
 */
export function useTraderWalletDepositRealtime(queryClient: QueryClient): void {
  const invalidateDebouncer = useRef(createDebouncer(INVALIDATE_DEBOUNCE_MS));

  const invalidateAll = () => {
    invalidateDebouncer.current.schedule(() => {
      void queryClient.invalidateQueries({ queryKey: traderKeys.usdtWallet() });
      void queryClient.invalidateQueries({ queryKey: traderKeys.balancesMe() });
      void queryClient.invalidateQueries({ queryKey: traderKeys.balanceTransactionsScope });
    });
  };

  useEffect(() => () => invalidateDebouncer.current.dispose(), []);

  useSseSubscription({
    path: internalPaths.traderWalletEventsStream,
    requireAuth: true,
    onVisibleAgain: invalidateAll,
    onMessage: (raw) => {
      try {
        const parsed = JSON.parse(raw) as { type?: string };
        if (parsed?.type === 'deposit') {
          invalidateAll();
        }
      } catch {
        /* malformed line */
      }
    },
  });
}

/**
 * Merchant cabinet: Pay-In + Pay-Out order updates (Bearer token).
 */
export function useMerchantOrdersRealtime(queryClient: QueryClient): void {
  const invalidateDebouncer = useRef(createDebouncer(INVALIDATE_DEBOUNCE_MS));

  const invalidateAll = () => {
    invalidateDebouncer.current.schedule(() => {
      void queryClient.invalidateQueries({ queryKey: merchantKeys.ordersScope });
      void queryClient.invalidateQueries({ queryKey: merchantKeys.stats() });
      void queryClient.invalidateQueries({ queryKey: merchantKeys.balances() });
      void queryClient.invalidateQueries({ queryKey: merchantKeys.analyticsScope });
    });
  };

  useEffect(() => () => invalidateDebouncer.current.dispose(), []);

  useSseSubscription({
    path: internalPaths.merchantOrdersStream,
    requireAuth: true,
    onVisibleAgain: invalidateAll,
    onMessage: (raw) => {
      try {
        const parsed = JSON.parse(raw) as PayinOrderRealtimeEvent | PayOutOrderRealtimeEvent;
        if (
          parsed.type === PAYIN_ORDER_REALTIME_EVENT_TYPE ||
          parsed.type === PAYOUT_ORDER_REALTIME_EVENT_TYPE
        ) {
          invalidateAll();
        }
      } catch {
        /* malformed line */
      }
    },
  });
}

/**
 * Admin / owner / support: global order lifecycle SSE (JWT). Support uses `/api/admin/orders/stream`.
 */
export function useStaffOrdersRealtime(queryClient: QueryClient): void {
  const invalidateDebouncer = useRef(createDebouncer(INVALIDATE_DEBOUNCE_MS));

  const invalidateAll = () => {
    invalidateDebouncer.current.schedule(() => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.ordersScope });
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
      void queryClient.invalidateQueries({ queryKey: ownerKeys.ordersScope });
      void queryClient.invalidateQueries({ queryKey: ownerKeys.orderDetailsScope });
      void queryClient.invalidateQueries({ queryKey: ownerKeys.stats() });
      void queryClient.invalidateQueries({ queryKey: supportKeys.ordersScope });
      void queryClient.invalidateQueries({ queryKey: supportKeys.orderDetailsScope });
      void queryClient.invalidateQueries({ queryKey: supportKeys.stats() });
    });
  };

  useEffect(() => () => invalidateDebouncer.current.dispose(), []);

  useSseSubscription({
    path: internalPaths.adminOrdersStream,
    requireAuth: true,
    onVisibleAgain: invalidateAll,
    onMessage: (raw) => {
      try {
        const parsed = JSON.parse(raw) as PayinOrderRealtimeEvent | PayOutOrderRealtimeEvent;
        if (
          parsed.type === PAYIN_ORDER_REALTIME_EVENT_TYPE ||
          parsed.type === PAYOUT_ORDER_REALTIME_EVENT_TYPE
        ) {
          invalidateAll();
        }
      } catch {
        /* malformed line */
      }
    },
  });
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

  useSseSubscription({
    path: internalPaths.payOrderStream(orderId),
    enabled,
    onVisibleAgain: () => onUpdateRef.current(),
    onMessage: () => {
      onUpdateRef.current();
    },
  });
}

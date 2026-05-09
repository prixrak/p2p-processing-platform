import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EMPTY, Observable, timer } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import Redis from 'ioredis';
import type { PayinOrderRealtimeEvent } from '@p2p/shared';
import { createRedisConnectionOptions } from '../../common/redis-connection-options';

/** Redis pub/sub channel for one order (public pay page, targeted invalidation). */
export function payinOrderChannel(orderId: string): string {
  return `payin:order:${orderId}`;
}

/** Redis pub/sub channel for all orders visible to a trader. */
export function payinTraderChannel(traderId: string): string {
  return `payin:trader:${traderId}`;
}

/** Redis pub/sub channel for all Pay-In orders belonging to a merchant (cabinet SSE). */
export function payinMerchantChannel(merchantId: string): string {
  return `payin:merchant:${merchantId}`;
}

/** Redis broadcast for admin / owner / support SSE (JWT required on HTTP). */
export function payinStaffBroadcastChannel(): string {
  return 'payin:staff';
}

/**
 * Publishes Pay-In order change notifications and exposes SSE streams backed by Redis pub/sub.
 * Use a dedicated connection for PUBLISH; each SSE connection uses duplicate() + SUBSCRIBE.
 *
 * Reverse-proxy: disable response buffering for SSE (e.g. nginx `proxy_buffering off;` and
 * `X-Accel-Buffering: no` on the response).
 */
@Injectable()
export class PayinRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayinRealtimeService.name);
  private publisher!: Redis;

  onModuleInit(): void {
    this.publisher = new Redis(createRedisConnectionOptions());
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
  }

  async publish(event: PayinOrderRealtimeEvent): Promise<void> {
    const payload = JSON.stringify(event);
    try {
      const ops: Promise<number>[] = [
        this.publisher.publish(payinOrderChannel(event.orderId), payload),
        this.publisher.publish(payinMerchantChannel(event.merchantId), payload),
        this.publisher.publish(payinStaffBroadcastChannel(), payload),
      ];
      if (event.traderId) {
        ops.push(this.publisher.publish(payinTraderChannel(event.traderId), payload));
      }
      await Promise.all(ops);
    } catch (err) {
      this.logger.warn({ err }, 'payin realtime publish failed');
    }
  }

  streamForTrader(traderId: string): Observable<MessageEvent> {
    const channel = payinTraderChannel(traderId);
    return this.pipeSseResilience(this.createSseObservable(channel), channel);
  }

  streamForOrder(orderId: string): Observable<MessageEvent> {
    const channel = payinOrderChannel(orderId);
    return this.pipeSseResilience(this.createSseObservable(channel), channel);
  }

  streamForMerchant(merchantId: string): Observable<MessageEvent> {
    const channel = payinMerchantChannel(merchantId);
    return this.pipeSseResilience(this.createSseObservable(channel), channel);
  }

  /** SSE for staff orders views (merged with payout staff stream at controller level). */
  streamForStaffCabinet(): Observable<MessageEvent> {
    const channel = payinStaffBroadcastChannel();
    return this.pipeSseResilience(this.createSseObservable(channel), channel);
  }

  private pipeSseResilience(stream: Observable<MessageEvent>, channel: string): Observable<MessageEvent> {
    return stream.pipe(
      retry({
        count: 5,
        delay: (_err, retryCount) =>
          timer(Math.min(500 * 2 ** Math.max(0, retryCount - 1), 16_000)),
      }),
      catchError((err: unknown) => {
        this.logger.error({ err, channel }, 'payin SSE stream failed after retries');
        return EMPTY;
      }),
    );
  }

  private createSseObservable(channel: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const sub = this.publisher.duplicate();
      const onMessage = (ch: string, message: string) => {
        if (ch === channel) {
          observer.next({ data: message });
        }
      };
      const onError = (err: Error) => {
        this.logger.warn({ err, channel }, 'payin realtime subscriber error');
        observer.error(err);
      };

      sub.on('message', onMessage);
      sub.on('error', onError);

      void sub.subscribe(channel).catch((err: Error) => {
        observer.error(err);
      });

      return () => {
        sub.off('message', onMessage);
        sub.off('error', onError);
        void sub.unsubscribe(channel).finally(() => {
          sub.disconnect();
        });
      };
    });
  }
}

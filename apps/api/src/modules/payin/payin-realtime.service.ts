import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import type { PayinOrderRealtimeEvent } from '@p2p/shared';

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
    this.publisher = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null,
    });
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
    return this.createSseObservable(channel);
  }

  streamForOrder(orderId: string): Observable<MessageEvent> {
    const channel = payinOrderChannel(orderId);
    return this.createSseObservable(channel);
  }

  streamForMerchant(merchantId: string): Observable<MessageEvent> {
    return this.createSseObservable(payinMerchantChannel(merchantId));
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

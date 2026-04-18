import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { config } from '@p2p/config';
import type { PayOutOrderRealtimeEvent } from '@p2p/shared';

export function payoutOrderChannel(orderId: string): string {
  return `payout:order:${orderId}`;
}

export function payoutTraderChannel(traderId: string): string {
  return `payout:trader:${traderId}`;
}

/** Broadcast channel when the public pool gains or loses a PENDING unassigned order. */
export function payoutPoolChannel(): string {
  return 'payout:pool';
}

export function payoutMerchantChannel(merchantId: string): string {
  return `payout:merchant:${merchantId}`;
}

@Injectable()
export class PayoutRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutRealtimeService.name);
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

  async publish(event: PayOutOrderRealtimeEvent): Promise<void> {
    const payload = JSON.stringify(event);
    try {
      const ops: Promise<number>[] = [
        this.publisher.publish(payoutOrderChannel(event.orderId), payload),
        this.publisher.publish(payoutMerchantChannel(event.merchantId), payload),
      ];
      if (event.traderId) {
        ops.push(this.publisher.publish(payoutTraderChannel(event.traderId), payload));
      }
      if (event.poolChanged) {
        ops.push(this.publisher.publish(payoutPoolChannel(), payload));
      }
      await Promise.all(ops);
    } catch (err) {
      this.logger.warn({ err }, 'payout realtime publish failed');
    }
  }

  /** Trader stream: own orders + public pool changes. */
  streamForTrader(traderId: string): Observable<MessageEvent> {
    return this.createSseObservable([payoutTraderChannel(traderId), payoutPoolChannel()]);
  }

  streamForMerchant(merchantId: string): Observable<MessageEvent> {
    return this.createSseObservable([payoutMerchantChannel(merchantId)]);
  }

  private createSseObservable(channels: string[]): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      const sub = this.publisher.duplicate();
      const channelSet = new Set(channels);
      const onMessage = (ch: string, message: string) => {
        if (channelSet.has(ch)) {
          observer.next({ data: message });
        }
      };
      const onError = (err: Error) => {
        this.logger.warn({ err, channels }, 'payout realtime subscriber error');
        observer.error(err);
      };

      sub.on('message', onMessage);
      sub.on('error', onError);

      void sub.subscribe(...channels).catch((err: Error) => {
        observer.error(err);
      });

      return () => {
        sub.off('message', onMessage);
        sub.off('error', onError);
        void sub.unsubscribe(...channels).finally(() => {
          sub.disconnect();
        });
      };
    });
  }
}

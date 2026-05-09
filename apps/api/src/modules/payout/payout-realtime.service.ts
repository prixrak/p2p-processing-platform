import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EMPTY, Observable, timer } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import Redis from 'ioredis';
import type { PayOutOrderRealtimeEvent } from '@p2p/shared';
import { createRedisConnectionOptions } from '../../common/redis-connection-options';

export function payoutOrderChannel(orderId: string): string {
  return `payout:order:${orderId}`;
}

export function payoutTraderChannel(traderId: string): string {
  return `payout:trader:${traderId}`;
}

export function payoutSpecialistChannel(payoutTraderId: string): string {
  return `payout:specialist:${payoutTraderId}`;
}

/** Broadcast channel when the public pool gains or loses a PENDING unassigned order. */
export function payoutPoolChannel(): string {
  return 'payout:pool';
}

export function payoutMerchantChannel(merchantId: string): string {
  return `payout:merchant:${merchantId}`;
}

/** Redis broadcast for admin / owner / support SSE (JWT required on HTTP). */
export function payoutStaffBroadcastChannel(): string {
  return 'payout:staff';
}

@Injectable()
export class PayoutRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutRealtimeService.name);
  private publisher!: Redis;

  onModuleInit(): void {
    this.publisher = new Redis(createRedisConnectionOptions());
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
        this.publisher.publish(payoutStaffBroadcastChannel(), payload),
      ];
      if (event.traderId) {
        ops.push(this.publisher.publish(payoutTraderChannel(event.traderId), payload));
      }
      if (event.payoutTraderId) {
        ops.push(this.publisher.publish(payoutSpecialistChannel(event.payoutTraderId), payload));
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
    return this.pipeSseResilience(
      this.createSseObservable([payoutTraderChannel(traderId), payoutPoolChannel()]),
      traderId,
    );
  }

  streamForPayoutSpecialist(payoutTraderId: string): Observable<MessageEvent> {
    return this.pipeSseResilience(
      this.createSseObservable([payoutSpecialistChannel(payoutTraderId), payoutPoolChannel()]),
      payoutTraderId,
    );
  }

  streamForMerchant(merchantId: string): Observable<MessageEvent> {
    return this.pipeSseResilience(
      this.createSseObservable([payoutMerchantChannel(merchantId)]),
      merchantId,
    );
  }

  streamForStaffCabinet(): Observable<MessageEvent> {
    const channel = payoutStaffBroadcastChannel();
    return this.pipeSseResilience(this.createSseObservable([channel]), 'payout-staff');
  }

  private pipeSseResilience(
    stream: Observable<MessageEvent>,
    streamId: string,
  ): Observable<MessageEvent> {
    return stream.pipe(
      retry({
        count: 5,
        delay: (_err, retryCount) =>
          timer(Math.min(500 * 2 ** Math.max(0, retryCount - 1), 16_000)),
      }),
      catchError((err: unknown) => {
        this.logger.error({ err, streamId }, 'payout SSE stream failed after retries');
        return EMPTY;
      }),
    );
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

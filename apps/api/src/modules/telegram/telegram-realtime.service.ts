import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EMPTY, Observable, timer } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import Redis from 'ioredis';
import {
  TELEGRAM_LINKED_REALTIME_EVENT_TYPE,
  type TelegramLinkedRealtimeEvent,
} from '@p2p/shared';
import { createRedisConnectionOptions } from '../../common/redis-connection-options';

export function telegramTraderChannel(traderId: string): string {
  return `telegram:trader:${traderId}`;
}

export function telegramPayoutTraderChannel(payoutTraderId: string): string {
  return `telegram:payout-trader:${payoutTraderId}`;
}

@Injectable()
export class TelegramRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramRealtimeService.name);
  private publisher!: Redis;

  onModuleInit(): void {
    this.publisher = new Redis(createRedisConnectionOptions());
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
  }

  async publishTraderLinked(
    traderId: string,
    payload: Pick<TelegramLinkedRealtimeEvent, 'chatId' | 'isActive'>,
  ): Promise<void> {
    await this.publish(telegramTraderChannel(traderId), payload);
  }

  async publishPayoutTraderLinked(
    payoutTraderId: string,
    payload: Pick<TelegramLinkedRealtimeEvent, 'chatId' | 'isActive'>,
  ): Promise<void> {
    await this.publish(telegramPayoutTraderChannel(payoutTraderId), payload);
  }

  streamForTrader(traderId: string): Observable<MessageEvent> {
    return this.pipeSseResilience(
      this.createSseObservable(telegramTraderChannel(traderId)),
      telegramTraderChannel(traderId),
    );
  }

  streamForPayoutTrader(payoutTraderId: string): Observable<MessageEvent> {
    return this.pipeSseResilience(
      this.createSseObservable(telegramPayoutTraderChannel(payoutTraderId)),
      telegramPayoutTraderChannel(payoutTraderId),
    );
  }

  private async publish(
    channel: string,
    payload: Pick<TelegramLinkedRealtimeEvent, 'chatId' | 'isActive'>,
  ): Promise<void> {
    const event: TelegramLinkedRealtimeEvent = {
      type: TELEGRAM_LINKED_REALTIME_EVENT_TYPE,
      ...payload,
    };
    try {
      await this.publisher.publish(channel, JSON.stringify(event));
    } catch (err) {
      this.logger.warn({ err, channel }, 'telegram linked realtime publish failed');
    }
  }

  private pipeSseResilience(
    stream: Observable<MessageEvent>,
    channel: string,
  ): Observable<MessageEvent> {
    return stream.pipe(
      retry({
        count: 5,
        delay: (_err, retryCount) =>
          timer(Math.min(500 * 2 ** Math.max(0, retryCount - 1), 16_000)),
      }),
      catchError((err: unknown) => {
        this.logger.error({ err, channel }, 'telegram SSE stream failed after retries');
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
        this.logger.warn({ err, channel }, 'telegram realtime subscriber error');
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

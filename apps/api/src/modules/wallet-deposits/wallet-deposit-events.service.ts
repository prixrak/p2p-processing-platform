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
import { config } from '@p2p/config';
import { createRedisConnectionOptions } from '../../common/redis-connection-options';
import { BlockchainNetwork } from '@prisma/client';

/** Redis channel template from TZ Monitor Service §4. */
export function traderWalletEventsChannel(traderId: string): string {
  return `trader:${traderId}:events`;
}

export type WalletDepositRealtimePayload = {
  type: 'deposit';
  amount: string;
  tx_hash: string;
  timestamp: string;
};

/**
 * Publishes wallet deposit notifications (Redis pub/sub) for SSE bridges and sweep triggers.
 * `sweepBalanceHint` should be the live on-chain USDT balance for the deposit address when available (TZ `sweep_check.on_chain_balance`).
 */
@Injectable()
export class WalletDepositEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletDepositEventsService.name);
  private publisher!: Redis;

  onModuleInit(): void {
    this.publisher = new Redis(createRedisConnectionOptions());
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
  }

  async publishAfterTrc20Credit(params: {
    traderId: string;
    txHash: string;
    amountUsdt: string;
    toAddress: string | null;
    sweepBalanceHint: string;
  }): Promise<void> {
    const event: WalletDepositRealtimePayload = {
      type: 'deposit',
      amount: params.amountUsdt,
      tx_hash: params.txHash,
      timestamp: new Date().toISOString(),
    };
    const sweepPayload = {
      trader_id: params.traderId,
      address: params.toAddress ?? '',
      on_chain_balance: params.sweepBalanceHint,
    };
    try {
      await Promise.all([
        this.publisher.publish(traderWalletEventsChannel(params.traderId), JSON.stringify(event)),
        this.publisher.publish(config.sweep.sweepCheckChannel, JSON.stringify(sweepPayload)),
      ]);
    } catch (err) {
      this.logger.warn({ err }, 'wallet deposit Redis publish failed');
    }
  }

  static shouldPublish(network: BlockchainNetwork, actorId: string | null): boolean {
    return network === BlockchainNetwork.TRC20 && actorId === null;
  }

  /**
   * SSE stream for the trader cabinet: instant TRC-20 deposit credits (TZ Realtime Push).
   */
  streamForTrader(traderId: string): Observable<MessageEvent> {
    const channel = traderWalletEventsChannel(traderId);
    return this.pipeSseResilience(this.createSseObservable(channel), channel);
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
        this.logger.error({ err, channel }, 'wallet deposit SSE stream failed after retries');
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
        this.logger.warn({ err, channel }, 'wallet deposit realtime subscriber error');
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

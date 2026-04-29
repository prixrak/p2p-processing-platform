import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createRedisConnectionOptions } from '../../common/redis-connection-options';

const PAYLOAD_PREFIX = 'p2p:cascade:payload:v2:';
const LOCK_PREFIX = 'p2p:cascade:lock:req:';

export type CoverageNominalRow = { nominal: number; count: number };

/** Base requisite row used by cascade ranking (matches DB snapshot query). */
export type CascadeReqSnapshotRow = {
  id: string;
  traderId: string;
  processingMethod: string;
  usedAmount: number;
  limitTotalAmount: number;
  usedOps: number;
  limitTotalOps: number;
  minAmount: number;
  maxAmount: number;
  payinRate: number;
};

/**
 * Fork autolimit-derived fields stored in Redis with the materialized snapshot (spec §4.4, §8).
 */
export type CascadeReqRedisMeta = {
  fill_ratio: number;
  fork_autolimit_active: boolean;
  /** remaining_amount / remaining_tx when Fork autolimit is active; omitted otherwise */
  fork_auto_min_estimate?: number;
};

export type CascadeStoredSnapshot = CascadeReqSnapshotRow & {
  redis_meta?: CascadeReqRedisMeta;
};

export type CascadeCurrencyPayload = {
  /** Deterministic fingerprint of requisite usage rows for cache validation inside transactions */
  snapshot_row_sig: string;
  nominal_amounts: number[];
  nominals: CoverageNominalRow[];
  snapshots: CascadeStoredSnapshot[];
  built_at: string;
};

/**
 * Unified Redis materialization for nominal coverage + active requisite snapshots (spec §5 / §6).
 * Distributed locks on requisite ids during Pay-In assignment (spec §6 step 5).
 */
@Injectable()
export class CascadeRedisStateService implements OnModuleDestroy {
  private readonly logger = new Logger(CascadeRedisStateService.name);
  private redis: Redis | null = null;
  private readonly ttlSec = 120;
  /** Assignment lock — held until Pay-In tx commits (released by caller; TTL is safety net) */
  private readonly lockTtlMs = 55_000;

  constructor() {
    try {
      this.redis = new Redis({
        ...createRedisConnectionOptions(),
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      });
      void this.redis.connect().catch((e) => {
        this.logger.warn(`Cascade Redis state disabled: ${e}`);
        this.redis = null;
      });
    } catch (e) {
      this.logger.warn(`Cascade Redis state disabled: ${e}`);
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }

  private payloadKey(currency: string): string {
    return `${PAYLOAD_PREFIX}${currency.trim().toUpperCase()}`;
  }

  private lockKey(requisiteId: string): string {
    return `${LOCK_PREFIX}${requisiteId}`;
  }

  async getPayload(currency: string): Promise<CascadeCurrencyPayload | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.payloadKey(currency));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CascadeCurrencyPayload;
      if (!parsed?.snapshots || !Array.isArray(parsed.nominals)) return null;
      return parsed;
    } catch (e) {
      this.logger.warn(`Cascade payload read failed: ${e}`);
      return null;
    }
  }

  async setPayload(currency: string, payload: CascadeCurrencyPayload): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(this.payloadKey(currency), JSON.stringify(payload), 'EX', this.ttlSec);
    } catch (e) {
      this.logger.warn(`Cascade payload write failed: ${e}`);
    }
  }

  /** Best-effort delete payload for one currency */
  async invalidateCurrency(currency: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.payloadKey(currency));
    } catch (e) {
      this.logger.warn(`Cascade payload invalidate failed: ${e}`);
    }
  }

  async invalidateAll(): Promise<void> {
    if (!this.redis) return;
    try {
      const keys: string[] = [];
      const stream = this.redis.scanStream({ match: `${PAYLOAD_PREFIX}*`, count: 64 });
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (batch: string[]) => {
          keys.push(...batch);
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      if (keys.length > 0) await this.redis.del(...keys);
    } catch (e) {
      this.logger.warn(`Cascade payload invalidateAll failed: ${e}`);
    }
  }

  /**
   * Distributed lock for requisite assignment (spec §6). NX + TTL.
   */
  async tryAcquireRequisiteLock(requisiteId: string): Promise<boolean> {
    if (!this.redis) return true;
    try {
      const r = await this.redis.set(
        this.lockKey(requisiteId),
        '1',
        'PX',
        this.lockTtlMs,
        'NX',
      );
      return r === 'OK';
    } catch (e) {
      this.logger.warn(`Cascade requisite lock acquire failed: ${e}`);
      return true;
    }
  }

  async releaseRequisiteLock(requisiteId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.lockKey(requisiteId));
    } catch (e) {
      this.logger.warn(`Cascade requisite lock release failed: ${e}`);
    }
  }
}

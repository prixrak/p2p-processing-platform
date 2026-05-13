import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createRedisConnectionOptions } from '../../common/redis-connection-options';

const PAYLOAD_PREFIX = 'p2p:cascade:payload:v3:';
const LOCK_PREFIX = 'p2p:cascade:lock:req:';
const ASSIGN_PREFIX = 'p2p:cascade:req:assign:';

export type CoverageNominalRow = { nominal: number; count: number };

/** Base requisite row used by cascade ranking (matches DB snapshot query). */
export type CascadeReqSnapshotRow = {
  id: string;
  traderId: string;
  processingMethod: string;
  usedAmount: number;
  limitTotalAmount: number;
  /** Confirmed Pay-In fiat volume (paid outcomes); fork-tier fill multiplier input */
  confirmedPayinAmount: number;
  usedOps: number;
  limitTotalOps: number;
  minAmount: number;
  maxAmount: number;
  payinRate: number;
  cascadeIdleAnchorAt: string;
  payinAssignmentsCount: number;
  cascadeRatingMultiplier: number;
};

/**
 * Observability fields stored with the materialized snapshot (requisite rating TZ).
 */
export type CascadeReqRedisMeta = {
  fill_ratio: number;
  fill_ratio_tx: number;
  /** TZ display: int 0–100 from amount fill ratio */
  rating: number;
  remaining_amount: number;
  remaining_transactions: number;
  effective_min: number | null;
  effective_max: number | null;
  /** Fork autolimit auto max from coverage-gap algorithm */
  auto_max_amount?: number;
  fork_autolimit_active: boolean;
  /** remaining_amount / remaining_tx when Fork autolimit is active */
  fork_auto_min_estimate?: number;
  /** TZ fork: confirmed_payin_amount / limit_total_amount */
  confirmed_fill_ratio: number;
  /** TZ fork fill multiplier steps from confirmed_fill_ratio */
  fill_multiplier: number;
  /** Idle-time race (TZ v3.1): ms since cascade idle anchor */
  idle_ms?: number;
  newcomer_boost: number;
  /** Tier-specific idle race score (fork vs card formula) */
  race_score: number;
  /** Same as race_score; kept for API compatibility */
  weighted_score: number;
  /** Preview: eligible for default preview amount (see payload preview_amount) */
  is_eligible_preview: boolean;
  /** 1-based rank for preview amount ordering */
  cascade_rank: number | null;
};

export type CascadeStoredSnapshot = CascadeReqSnapshotRow & {
  redis_meta?: CascadeReqRedisMeta;
};

export type CascadeCurrencyPayload = {
  payload_version: 6;
  /** Deterministic fingerprint of requisite usage rows for cache validation inside transactions */
  snapshot_row_sig: string;
  /** Fingerprint of `cascade_settings.fill_multipliers_config` JSON (invalidates ranking when ladder changes). */
  fill_config_fingerprint: string;
  nominal_amounts: number[];
  nominals: CoverageNominalRow[];
  snapshots: CascadeStoredSnapshot[];
  built_at: string;
  /** Amount used for is_eligible_preview and cascade_rank in redis_meta */
  preview_amount: number;
};

export type RequisiteAssignmentMeta = {
  last_assigned_at: string | null;
  last_assignment_order_id: string | null;
  assignments_count: number;
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
  /** Rolling window for assignment counters / last assignment metadata */
  private readonly assignHashTtlSec = 86_400;

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

  private assignKey(requisiteId: string): string {
    return `${ASSIGN_PREFIX}${requisiteId}`;
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

  /**
   * Records assignment telemetry (rolling window TTL). Called after Pay-In commit.
   */
  async recordRequisiteAssignment(requisiteId: string, payinOrderId: string): Promise<void> {
    if (!this.redis) return;
    const key = this.assignKey(requisiteId);
    const now = new Date().toISOString();
    try {
      await this.redis
        .multi()
        .hset(key, 'last_assigned_at', now)
        .hset(key, 'last_assignment_order_id', payinOrderId)
        .hincrby(key, 'assignments_count', 1)
        .expire(key, this.assignHashTtlSec)
        .exec();
    } catch (e) {
      this.logger.warn(`Cascade assignment record failed: ${e}`);
    }
  }

  async getRequisiteAssignmentMetaMany(
    requisiteIds: string[],
  ): Promise<Map<string, RequisiteAssignmentMeta>> {
    const out = new Map<string, RequisiteAssignmentMeta>();
    if (!this.redis || requisiteIds.length === 0) {
      for (const id of requisiteIds) {
        out.set(id, {
          last_assigned_at: null,
          last_assignment_order_id: null,
          assignments_count: 0,
        });
      }
      return out;
    }
    try {
      const pipe = this.redis.pipeline();
      for (const id of requisiteIds) {
        pipe.hgetall(this.assignKey(id));
      }
      const rows = await pipe.exec();
      for (let i = 0; i < requisiteIds.length; i++) {
        const id = requisiteIds[i]!;
        const raw = rows?.[i]?.[1] as Record<string, string> | null;
        if (!raw || Object.keys(raw).length === 0) {
          out.set(id, {
            last_assigned_at: null,
            last_assignment_order_id: null,
            assignments_count: 0,
          });
        } else {
          out.set(id, {
            last_assigned_at: raw['last_assigned_at'] ?? null,
            last_assignment_order_id: raw['last_assignment_order_id'] ?? null,
            assignments_count: Number(raw['assignments_count'] ?? 0) || 0,
          });
        }
      }
    } catch (e) {
      this.logger.warn(`Cascade assignment meta read failed: ${e}`);
      for (const id of requisiteIds) {
        if (!out.has(id)) {
          out.set(id, {
            last_assigned_at: null,
            last_assignment_order_id: null,
            assignments_count: 0,
          });
        }
      }
    }
    return out;
  }

  /** Whether each requisite id currently holds the distributed assignment lock */
  async areRequisitesLocked(requisiteIds: string[]): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    if (!this.redis || requisiteIds.length === 0) {
      for (const id of requisiteIds) out.set(id, false);
      return out;
    }
    try {
      const pipe = this.redis.pipeline();
      for (const id of requisiteIds) {
        pipe.exists(this.lockKey(id));
      }
      const rows = await pipe.exec();
      for (let i = 0; i < requisiteIds.length; i++) {
        const id = requisiteIds[i]!;
        const n = Number(rows?.[i]?.[1] ?? 0);
        out.set(id, n === 1);
      }
    } catch (e) {
      this.logger.warn(`Cascade lock batch read failed: ${e}`);
      for (const id of requisiteIds) out.set(id, false);
    }
    return out;
  }
}

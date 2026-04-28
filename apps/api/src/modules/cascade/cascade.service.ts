import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

export interface CascadeResult {
  traderId: string;
  requisiteId: string;
  score: number;
}

@Injectable()
export class CascadeService {
  private readonly logger = new Logger(CascadeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findBestRequisite(params: {
    amount: number;
    currency: string;
    bankId?: number;
  }): Promise<CascadeResult | null> {
    const candidates = await this.prisma.$queryRaw<Array<{
      id: string;
      traderId: string;
      number: string;
      owner: string;
      bankId: number | null;
      usedAmount: number;
      usedOps: number;
      limitTotalAmount: number;
      limitTotalOps: number;
      minAmount: number;
      maxAmount: number;
      successRate: number;
      avgResponseTime: number;
      totalOrders: number;
    }>>`
      SELECT
        r.id,
        r.trader_id AS "traderId",
        r.number,
        r.owner,
        r.bank_id AS "bankId",
        r.used_amount::numeric AS "usedAmount",
        r.used_ops AS "usedOps",
        r.limit_total_amount::numeric AS "limitTotalAmount",
        r.limit_total_ops AS "limitTotalOps",
        r.min_amount::numeric AS "minAmount",
        r.max_amount::numeric AS "maxAmount",
        COALESCE(stats.success_rate, 100) AS "successRate",
        COALESCE(stats.avg_response_time, 0) AS "avgResponseTime",
        COALESCE(stats.total_orders, 0) AS "totalOrders"
      FROM requisites r
      INNER JOIN requisite_groups g ON g.id = r.requisite_group_id
        AND g.archived_at IS NULL
        AND g.is_active = true
      JOIN trader_profiles tp ON tp.id = r.trader_id AND tp.is_active = true AND tp.accepting_orders = true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(CASE WHEN po.status = 'PAID' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS success_rate,
          AVG(EXTRACT(EPOCH FROM (po.confirmed_at - po.created_at))) AS avg_response_time,
          COUNT(*) AS total_orders
        FROM payin_orders po
        WHERE po.trader_id = r.trader_id
          AND po.created_at > NOW() - INTERVAL '7 days'
      ) stats ON true
      WHERE r.is_active = true
        AND r.currency = ${params.currency}
        AND r.min_amount <= ${params.amount}
        AND r.max_amount >= ${params.amount}
        AND r.used_amount + ${params.amount} <= r.limit_total_amount
        AND r.used_ops < r.limit_total_ops
        ${params.bankId ? Prisma.sql`AND (r.bank_id = ${params.bankId} OR r.accepts_other_banks = true)` : Prisma.empty}
      ORDER BY
        stats.success_rate DESC NULLS LAST,
        stats.avg_response_time ASC NULLS LAST,
        r.used_amount ASC
      LIMIT 1
      FOR UPDATE OF r SKIP LOCKED
    `;

    if (candidates.length === 0) {
      this.logger.warn(`No suitable requisite found for ${params.amount} ${params.currency}`);
      return null;
    }

    const best = candidates[0];
    const score =
      (best.successRate * 0.5) +
      (Math.max(0, 100 - best.avgResponseTime / 60) * 0.3) +
      ((1 - best.usedAmount / best.limitTotalAmount) * 100 * 0.2);

    this.logger.log(
      `Cascade selected requisite ${best.id} (trader ${best.traderId}) with score ${score.toFixed(1)}`,
    );

    return {
      traderId: best.traderId,
      requisiteId: best.id,
      score,
    };
  }

  async getDistributionStats() {
    const stats = await this.prisma.$queryRaw<Array<{
      traderId: string;
      email: string;
      activeRequisites: number;
      todayOrders: number;
      successRate: number;
    }>>`
      SELECT
        tp.id AS "traderId",
        u.email,
        COUNT(DISTINCT r.id) FILTER (WHERE r.is_active = true) AS "activeRequisites",
        COUNT(po.id) FILTER (WHERE po.created_at > CURRENT_DATE) AS "todayOrders",
        ROUND(
          COUNT(po.id) FILTER (WHERE po.status = 'PAID' AND po.created_at > NOW() - INTERVAL '7 days') * 100.0 /
          NULLIF(COUNT(po.id) FILTER (WHERE po.created_at > NOW() - INTERVAL '7 days'), 0),
          1
        ) AS "successRate"
      FROM trader_profiles tp
      JOIN users u ON u.id = tp.user_id
      LEFT JOIN requisites r ON r.trader_id = tp.id
      LEFT JOIN payin_orders po ON po.trader_id = tp.id
      WHERE tp.is_active = true
      GROUP BY tp.id, u.email
      ORDER BY "successRate" DESC NULLS LAST
    `;

    return stats;
  }
}

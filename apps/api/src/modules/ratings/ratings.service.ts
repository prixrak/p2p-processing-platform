import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

export interface TraderRating {
  traderId: string;
  email: string;
  overallScore: number;
  successRate: number;
  avgResponseMinutes: number;
  totalVolume: number;
  totalOrders: number;
  activeRequisites: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

export interface RequisiteRating {
  requisiteId: string;
  number: string;
  bank: string;
  successRate: number;
  avgAmount: number;
  totalOrders: number;
  utilization: number;
  score: number;
}

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTraderRatings(period: '7d' | '30d' | '90d' = '30d'): Promise<TraderRating[]> {
    const intervalMap = { '7d': '7 days', '30d': '30 days', '90d': '90 days' };
    const interval = intervalMap[period];

    const ratings = await this.prisma.$queryRaw<Array<{
      traderId: string;
      email: string;
      successRate: number;
      avgResponseMinutes: number;
      totalVolume: number;
      totalOrders: number;
      activeRequisites: number;
    }>>`
      SELECT
        tp.id AS "traderId",
        u.email,
        COALESCE(
          COUNT(po.id) FILTER (WHERE po.status = 'PAID') * 100.0 /
          NULLIF(COUNT(po.id), 0),
          0
        ) AS "successRate",
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (po.confirmed_at - po.created_at)) / 60)
          FILTER (WHERE po.confirmed_at IS NOT NULL),
          0
        ) AS "avgResponseMinutes",
        COALESCE(SUM(po.amount) FILTER (WHERE po.status = 'PAID'), 0) AS "totalVolume",
        COUNT(po.id) AS "totalOrders",
        (SELECT COUNT(*) FROM requisites r WHERE r.trader_id = tp.id AND r.is_active = true) AS "activeRequisites"
      FROM trader_profiles tp
      JOIN users u ON u.id = tp.user_id
      LEFT JOIN payin_orders po ON po.trader_id = tp.id
        AND po.created_at > NOW() - ${interval}::interval
      WHERE tp.is_active = true
      GROUP BY tp.id, u.email
      ORDER BY "successRate" DESC, "totalVolume" DESC
    `;

    return ratings.map((r) => {
      const overallScore =
        (Number(r.successRate) * 0.4) +
        (Math.max(0, 100 - Number(r.avgResponseMinutes)) * 0.3) +
        (Math.min(100, Number(r.totalOrders) / 10) * 0.15) +
        (Math.min(100, Number(r.activeRequisites) * 20) * 0.15);

      let tier: TraderRating['tier'] = 'bronze';
      if (overallScore >= 90) tier = 'platinum';
      else if (overallScore >= 75) tier = 'gold';
      else if (overallScore >= 50) tier = 'silver';

      return {
        ...r,
        successRate: Number(r.successRate),
        avgResponseMinutes: Number(r.avgResponseMinutes),
        totalVolume: Number(r.totalVolume),
        totalOrders: Number(r.totalOrders),
        activeRequisites: Number(r.activeRequisites),
        overallScore: Math.round(overallScore * 10) / 10,
        tier,
      };
    });
  }

  async getRequisiteRatings(traderId?: string): Promise<RequisiteRating[]> {
    const ratings = await this.prisma.$queryRaw<Array<{
      requisiteId: string;
      number: string;
      bank: string;
      successRate: number;
      avgAmount: number;
      totalOrders: number;
      usedAmount: number;
      limitTotalAmount: number;
    }>>`
      SELECT
        r.id AS "requisiteId",
        r.number,
        COALESCE(b.name, 'Unknown') AS bank,
        COALESCE(
          COUNT(po.id) FILTER (WHERE po.status = 'PAID') * 100.0 /
          NULLIF(COUNT(po.id), 0),
          0
        ) AS "successRate",
        COALESCE(AVG(po.amount), 0) AS "avgAmount",
        COUNT(po.id) AS "totalOrders",
        r.used_amount::numeric AS "usedAmount",
        r.limit_total_amount::numeric AS "limitTotalAmount"
      FROM requisites r
      LEFT JOIN banks b ON b.id = r.bank_id
      LEFT JOIN payin_orders po ON po.requisite_id = r.id
        AND po.created_at > NOW() - INTERVAL '30 days'
      WHERE r.is_active = true
        AND (${traderId}::text IS NULL OR r.trader_id = ${traderId}::text)
      GROUP BY r.id, r.number, b.name, r.used_amount, r.limit_total_amount
      ORDER BY "successRate" DESC, "totalOrders" DESC
    `;

    return ratings.map((r) => {
      const utilization = Number(r.limitTotalAmount) > 0
        ? (Number(r.usedAmount) / Number(r.limitTotalAmount)) * 100
        : 0;

      const score =
        (Number(r.successRate) * 0.5) +
        ((100 - utilization) * 0.3) +
        (Math.min(100, Number(r.totalOrders) / 5) * 0.2);

      return {
        requisiteId: r.requisiteId,
        number: r.number,
        bank: r.bank,
        successRate: Number(r.successRate),
        avgAmount: Number(r.avgAmount),
        totalOrders: Number(r.totalOrders),
        utilization: Math.round(utilization * 10) / 10,
        score: Math.round(score * 10) / 10,
      };
    });
  }
}

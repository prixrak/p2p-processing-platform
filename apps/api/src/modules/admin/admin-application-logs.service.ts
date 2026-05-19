import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import {
  ApplicationLogUiStatus,
  DirectionType,
  PayInOrderStatus,
  PayOutOrderStatus,
  PAYIN_NO_REQUISITE_REASON_VALUES,
  applicationLogErrorMessage,
  mapPayinToApplicationLogUiStatus,
  mapPayoutToApplicationLogUiStatus,
  resolvePayinApplicationLogErrorCode,
  resolvePayoutApplicationLogErrorCode,
} from '@p2p/shared';
import { ApplicationLogsQueryDto } from './dto/application-logs-query.dto';
import { resolveApplicationLogsDateRange } from './admin-application-logs-date-range.util';

/** Escape `%` and `_` for PostgreSQL ILIKE. */
function escapeIlikePattern(fragment: string): string {
  return fragment.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface ApplicationLogListItemDto {
  id: string;
  kind: 'PAYIN' | 'PAYOUT';
  requestId: string;
  createdAt: string;
  merchantName: string;
  traderLabel: string | null;
  direction: string;
  amount: number;
  currency: string;
  uiStatus: ApplicationLogUiStatus;
  errorCode: string | null;
  errorMessage: string | null;
  externalApiPath: string | null;
  partnerIp: string | null;
}

export interface ApplicationLogsSummaryDto {
  avgAmountPayin: number | null;
  avgAmountPayout: number | null;
  countPayin: number;
  countPayout: number;
  payinSuccessCount: number;
  payinErrorCount: number;
  payoutSuccessCount: number;
  payoutErrorCount: number;
  totals: {
    payinSuccessSum: number;
    payinErrorSum: number;
    payoutSuccessSum: number;
    payoutErrorSum: number;
  };
}

type SqlRow = {
  id: string;
  kind: string;
  request_id: string;
  created_at: Date;
  merchant_name: string;
  currency_code: string;
  amount: unknown;
  raw_status: string;
  no_requisite_reason: string | null;
  trader_reject_reason: string | null;
  partner_ip: string | null;
  external_api_path: string | null;
  trader_id: string | null;
  trader_standard_email: string | null;
  payout_specialist_email: string | null;
};

@Injectable()
export class AdminApplicationLogsService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeDates(dto: ApplicationLogsQueryDto): { from: Date; to: Date } {
    return resolveApplicationLogsDateRange({
      period: dto.period,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
    });
  }

  private payinExtraWhere(dto: ApplicationLogsQueryDto): Prisma.Sql {
    const parts: Prisma.Sql[] = [];

    if (dto.merchantId) {
      parts.push(Prisma.sql`po.merchant_id = ${dto.merchantId}::uuid`);
    }
    if (dto.traderId) {
      parts.push(Prisma.sql`po.trader_id = ${dto.traderId}::uuid`);
    }
    if (dto.currency) {
      parts.push(Prisma.sql`cur.code = ${dto.currency}`);
    }
    if (dto.amountMin != null) {
      parts.push(Prisma.sql`po.amount >= ${dto.amountMin}`);
    }
    if (dto.amountMax != null) {
      parts.push(Prisma.sql`po.amount <= ${dto.amountMax}`);
    }
    if (dto.partnerIp?.trim()) {
      const pat = `%${escapeIlikePattern(dto.partnerIp.trim())}%`;
      parts.push(Prisma.sql`po.partner_ip ILIKE ${pat} ESCAPE '\\'`);
    }

    if (dto.uiStatus) {
      if (dto.uiStatus === 'ERROR') {
        parts.push(Prisma.sql`po.status IN ('NO_REQUISITE', 'UPLOAD_FAILED')`);
      } else if (dto.uiStatus === 'SUCCESS') {
        parts.push(
          Prisma.sql`po.trader_id IS NOT NULL AND po.status NOT IN ('NO_REQUISITE', 'UPLOAD_FAILED')`,
        );
      } else {
        parts.push(
          Prisma.sql`po.trader_id IS NULL AND po.status NOT IN ('NO_REQUISITE', 'UPLOAD_FAILED')`,
        );
      }
    }

    if (dto.errorCode) {
      const ec = dto.errorCode.trim().toUpperCase();
      if (ec === 'NO_REQUISITE') {
        parts.push(Prisma.sql`po.status = 'NO_REQUISITE'`);
      } else if (ec === 'UPLOAD_FAILED') {
        parts.push(Prisma.sql`po.status = 'UPLOAD_FAILED'`);
      } else if (
        PAYIN_NO_REQUISITE_REASON_VALUES.includes(
          ec as (typeof PAYIN_NO_REQUISITE_REASON_VALUES)[number],
        )
      ) {
        parts.push(
          Prisma.sql`po.status = 'NO_REQUISITE' AND po.no_requisite_reason = ${ec}::"PayinNoRequisiteReason"`,
        );
      } else {
        parts.push(Prisma.sql`FALSE`);
      }
    }

    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND ${Prisma.join(parts, ' AND ')}`;
  }

  private payoutExtraWhere(dto: ApplicationLogsQueryDto): Prisma.Sql {
    const parts: Prisma.Sql[] = [];

    if (dto.merchantId) {
      parts.push(Prisma.sql`p.merchant_id = ${dto.merchantId}::uuid`);
    }
    if (dto.traderId) {
      parts.push(Prisma.sql`p.trader_id = ${dto.traderId}::uuid`);
    }
    if (dto.currency) {
      parts.push(Prisma.sql`cur.code = ${dto.currency}`);
    }
    if (dto.amountMin != null) {
      parts.push(Prisma.sql`p.amount >= ${dto.amountMin}`);
    }
    if (dto.amountMax != null) {
      parts.push(Prisma.sql`p.amount <= ${dto.amountMax}`);
    }
    if (dto.partnerIp?.trim()) {
      const pat = `%${escapeIlikePattern(dto.partnerIp.trim())}%`;
      parts.push(Prisma.sql`p.partner_ip ILIKE ${pat} ESCAPE '\\'`);
    }

    if (dto.uiStatus) {
      if (dto.uiStatus === 'SUCCESS') {
        parts.push(Prisma.sql`p.status = 'COMPLETED'`);
      } else if (dto.uiStatus === 'ERROR') {
        parts.push(Prisma.sql`p.status IN ('FAILED', 'UPLOAD_FAILED')`);
      } else {
        parts.push(
          Prisma.sql`p.status NOT IN ('COMPLETED', 'FAILED', 'UPLOAD_FAILED')`,
        );
      }
    }

    if (dto.errorCode) {
      const ec = dto.errorCode.trim().toUpperCase();
      if (ec === 'UPLOAD_FAILED') {
        parts.push(Prisma.sql`p.status = 'UPLOAD_FAILED'`);
      } else if (ec === 'FAILED') {
        parts.push(
          Prisma.sql`p.status = 'FAILED' AND p.trader_reject_reason IS NULL`,
        );
      } else if (ec === 'FOREIGN_CARD') {
        parts.push(
          Prisma.sql`p.status = 'FAILED' AND p.trader_reject_reason = 'FOREIGN_CARD'`,
        );
      } else if (ec === 'CARD_REFUND_IN_PROGRESS') {
        parts.push(
          Prisma.sql`p.status = 'FAILED' AND p.trader_reject_reason = 'CARD_REFUND_IN_PROGRESS'`,
        );
      } else if (ec === 'OTHER') {
        parts.push(
          Prisma.sql`p.status = 'FAILED' AND p.trader_reject_reason = 'OTHER'`,
        );
      } else {
        parts.push(Prisma.sql`FALSE`);
      }
    }

    if (parts.length === 0) return Prisma.empty;
    return Prisma.sql`AND ${Prisma.join(parts, ' AND ')}`;
  }

  private payinSelect(dto: ApplicationLogsQueryDto): Prisma.Sql {
    const { from, to } = this.normalizeDates(dto);
    const extra = this.payinExtraWhere(dto);
    return Prisma.sql`
SELECT
  po.id::text AS id,
  'PAYIN'::text AS kind,
  po.request_id AS request_id,
  po.created_at AS created_at,
  mer.name AS merchant_name,
  cur.code AS currency_code,
  po.amount AS amount,
  po.status::text AS raw_status,
  po.no_requisite_reason::text AS no_requisite_reason,
  NULL::text AS trader_reject_reason,
  po.partner_ip AS partner_ip,
  po.external_api_path AS external_api_path,
  po.trader_id::text AS trader_id,
  tu.email AS trader_standard_email,
  NULL::text AS payout_specialist_email
FROM payin_orders po
INNER JOIN merchants mer ON mer.id = po.merchant_id
INNER JOIN currencies cur ON cur.id = po.currency_id
LEFT JOIN trader_profiles tp ON tp.id = po.trader_id
LEFT JOIN users tu ON tu.id = tp.user_id
WHERE po.created_at >= ${from}::timestamptz
  AND po.created_at <= ${to}::timestamptz
  ${extra}
`;
  }

  private payoutSelect(dto: ApplicationLogsQueryDto): Prisma.Sql {
    const { from, to } = this.normalizeDates(dto);
    const extra = this.payoutExtraWhere(dto);
    return Prisma.sql`
SELECT
  p.id::text AS id,
  'PAYOUT'::text AS kind,
  p.request_id AS request_id,
  p.created_at AS created_at,
  mer.name AS merchant_name,
  cur.code AS currency_code,
  p.amount AS amount,
  p.status::text AS raw_status,
  NULL::text AS no_requisite_reason,
  p.trader_reject_reason::text AS trader_reject_reason,
  p.partner_ip AS partner_ip,
  p.external_api_path AS external_api_path,
  p.trader_id::text AS trader_id,
  tu.email AS trader_standard_email,
  pu.email AS payout_specialist_email
FROM payout_orders p
INNER JOIN merchants mer ON mer.id = p.merchant_id
INNER JOIN currencies cur ON cur.id = p.currency_id
LEFT JOIN trader_profiles tp ON tp.id = p.trader_id
LEFT JOIN users tu ON tu.id = tp.user_id
LEFT JOIN payout_traders pt ON pt.id = p.payout_trader_id
LEFT JOIN users pu ON pu.id = pt.user_id
WHERE p.created_at >= ${from}::timestamptz
  AND p.created_at <= ${to}::timestamptz
  ${extra}
`;
  }

  private unionCore(dto: ApplicationLogsQueryDto): Prisma.Sql {
    const kind = dto.kind?.toUpperCase();
    if (kind === DirectionType.PAYOUT) {
      return Prisma.sql`(${this.payoutSelect(dto)})`;
    }
    if (kind === DirectionType.PAYIN) {
      return Prisma.sql`(${this.payinSelect(dto)})`;
    }
    return Prisma.sql`(${this.payinSelect(dto)}) UNION ALL (${this.payoutSelect(dto)})`;
  }

  async list(dto: ApplicationLogsQueryDto): Promise<{
    items: ApplicationLogListItemDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const core = this.unionCore(dto);

    const countRows = await this.prisma.$queryRaw<[{ c: bigint }]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS c FROM (${core}) AS sub`,
    );
    const total = Number(countRows[0]?.c ?? 0n);

    const rows = await this.prisma.$queryRaw<SqlRow[]>(
      Prisma.sql`
SELECT * FROM (${core}) AS sub
ORDER BY sub.created_at DESC NULLS LAST, sub.id DESC
LIMIT ${limit} OFFSET ${skip}
`,
    );

    const items = rows.map((r) => this.rowToDto(r));
    return { items, total, page, limit };
  }

  async summary(dto: ApplicationLogsQueryDto): Promise<ApplicationLogsSummaryDto> {
    const core = this.unionCore(dto);

    type Agg = {
      kind: string;
      cnt: bigint;
      avg_amt: unknown | null;
      succ_cnt: bigint;
      err_cnt: bigint;
      succ_sum: unknown | null;
      err_sum: unknown | null;
    };

    const rows = await this.prisma.$queryRaw<Agg[]>(Prisma.sql`
SELECT
  kind,
  COUNT(*)::bigint AS cnt,
  AVG(amount)::numeric AS avg_amt,
  COUNT(*) FILTER (WHERE
    (kind = 'PAYIN' AND trader_id IS NOT NULL AND raw_status NOT IN ('NO_REQUISITE', 'UPLOAD_FAILED'))
    OR (kind = 'PAYOUT' AND raw_status = 'COMPLETED')
  )::bigint AS succ_cnt,
  COUNT(*) FILTER (WHERE
    (kind = 'PAYIN' AND raw_status IN ('NO_REQUISITE', 'UPLOAD_FAILED'))
    OR (kind = 'PAYOUT' AND raw_status IN ('FAILED', 'UPLOAD_FAILED'))
  )::bigint AS err_cnt,
  COALESCE(SUM(amount) FILTER (WHERE
    (kind = 'PAYIN' AND trader_id IS NOT NULL AND raw_status NOT IN ('NO_REQUISITE', 'UPLOAD_FAILED'))
    OR (kind = 'PAYOUT' AND raw_status = 'COMPLETED')
  ), 0)::numeric AS succ_sum,
  COALESCE(SUM(amount) FILTER (WHERE
    (kind = 'PAYIN' AND raw_status IN ('NO_REQUISITE', 'UPLOAD_FAILED'))
    OR (kind = 'PAYOUT' AND raw_status IN ('FAILED', 'UPLOAD_FAILED'))
  ), 0)::numeric AS err_sum
FROM (
  SELECT
    sub.kind,
    sub.amount,
    sub.raw_status,
    sub.trader_id
  FROM (${core}) AS sub
) AS x
GROUP BY kind
`);

    let payin: Agg | undefined;
    let payout: Agg | undefined;
    for (const r of rows) {
      if (r.kind === 'PAYIN') payin = r;
      if (r.kind === 'PAYOUT') payout = r;
    }

    const num = (v: unknown | null | undefined): number | null => {
      if (v == null) return null;
      const s = typeof v === 'object' && v !== null && 'toString' in v ? (v as { toString(): string }).toString() : String(v);
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    return {
      avgAmountPayin: num(payin?.avg_amt ?? null),
      avgAmountPayout: num(payout?.avg_amt ?? null),
      countPayin: Number(payin?.cnt ?? 0n),
      countPayout: Number(payout?.cnt ?? 0n),
      payinSuccessCount: Number(payin?.succ_cnt ?? 0n),
      payinErrorCount: Number(payin?.err_cnt ?? 0n),
      payoutSuccessCount: Number(payout?.succ_cnt ?? 0n),
      payoutErrorCount: Number(payout?.err_cnt ?? 0n),
      totals: {
        payinSuccessSum: num(payin?.succ_sum) ?? 0,
        payinErrorSum: num(payin?.err_sum) ?? 0,
        payoutSuccessSum: num(payout?.succ_sum) ?? 0,
        payoutErrorSum: num(payout?.err_sum) ?? 0,
      },
    };
  }

  private rowToDto(r: SqlRow): ApplicationLogListItemDto {
    const kind = r.kind === 'PAYOUT' ? 'PAYOUT' : 'PAYIN';
    const uiStatus =
      kind === 'PAYIN'
        ? mapPayinToApplicationLogUiStatus(r.raw_status as PayInOrderStatus, r.trader_id)
        : mapPayoutToApplicationLogUiStatus(r.raw_status as PayOutOrderStatus);

    let traderLabel: string | null = null;
    if (uiStatus === ApplicationLogUiStatus.SUCCESS) {
      traderLabel =
        kind === 'PAYIN'
          ? r.trader_standard_email
          : r.trader_standard_email ?? r.payout_specialist_email;
    }

    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    if (kind === 'PAYIN') {
      errorCode = resolvePayinApplicationLogErrorCode(
        r.raw_status as PayInOrderStatus,
        r.no_requisite_reason,
      );
      errorMessage =
        uiStatus === ApplicationLogUiStatus.ERROR
          ? applicationLogErrorMessage(
              'PAYIN',
              r.raw_status as PayInOrderStatus,
              undefined,
              r.no_requisite_reason,
            )
          : null;
    } else {
      errorCode = resolvePayoutApplicationLogErrorCode(
        r.raw_status as PayOutOrderStatus,
        r.trader_reject_reason,
      );
      errorMessage =
        uiStatus === ApplicationLogUiStatus.ERROR
          ? applicationLogErrorMessage(
              'PAYOUT',
              r.raw_status as PayOutOrderStatus,
              r.trader_reject_reason as never,
            )
          : null;
    }

    return {
      id: r.id,
      kind,
      requestId: r.request_id,
      createdAt: r.created_at.toISOString(),
      merchantName: r.merchant_name,
      traderLabel,
      direction: `${r.currency_code}/${r.currency_code}`,
      amount: Number(r.amount),
      currency: r.currency_code,
      uiStatus,
      errorCode,
      errorMessage,
      externalApiPath: r.external_api_path,
      partnerIp: r.partner_ip,
    };
  }

  async filterMeta() {
    const [merchants, traders, currencies] = await Promise.all([
      this.prisma.merchant.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.prisma.traderProfile.findMany({
        select: {
          id: true,
          user: { select: { email: true } },
        },
        orderBy: { id: 'asc' },
        take: 500,
      }),
      this.prisma.currency.findMany({
        where: { isActive: true },
        select: { code: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    return {
      merchants,
      traders: traders.map((t) => ({
        id: t.id,
        email: t.user.email,
      })),
      currencies: currencies.map((c) => c.code),
      errorCodes: [
        'NO_REQUISITE',
        ...PAYIN_NO_REQUISITE_REASON_VALUES,
        'UPLOAD_FAILED',
        'FAILED',
        'FOREIGN_CARD',
        'CARD_REFUND_IN_PROGRESS',
        'OTHER',
      ],
    };
  }
}

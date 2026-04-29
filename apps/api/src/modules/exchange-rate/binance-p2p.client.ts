import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';
import type { BinanceP2pOfferPick } from '@p2p/shared';
import { logExternalFailure } from '../../common/utils/external-error-log';

type BinanceAdvSearchRow = {
  /** Present when Binance places the row in a privileged / promoted slot (Block 5 §2.1). */
  privilegeType?: string | null;
  adv: {
    price: string;
    minSingleTransAmount: string;
    maxSingleTransAmount: string;
    privilegeType?: string | null;
    tradeMethods?: Array<{ payType?: string; tradeMethodName?: string }>;
  };
  advertiser?: { nickName?: string; userType?: string };
};

/** Binance `/c2c/adv/search` rejects `rows` above 20 with code 000002 (illegal parameter). */
const BINANCE_P2P_SEARCH_MAX_ROWS = 20;
/** After volume+payment filters we need ≥6 usable rows with default `skipTopAds=1`; a single page is often insufficient (Block 5 §2.1). */
const BINANCE_PARSER_MAX_PAGES = 5;

function isNonPrivilegedBinanceRow(row: BinanceAdvSearchRow): boolean {
  const outer = row.privilegeType != null && String(row.privilegeType).trim() !== '';
  const inner = row.adv?.privilegeType != null && String(row.adv.privilegeType).trim() !== '';
  return !outer && !inner;
}

/**
 * Fetches Binance P2P ads (buy USDT with fiat). Filtering / averaging per Block 5 is done in ExchangeRateService.
 */
@Injectable()
export class BinanceP2pClient {
  private readonly logger = new Logger(BinanceP2pClient.name);

  /**
   * Fetches several pages (`rows` capped at 20 per page by Binance) so volume filters can retain enough bids for averaging.
   */
  async fetchBuyUsdtOffers(
    fiat: string,
    payTypes: string[],
    rows = BINANCE_P2P_SEARCH_MAX_ROWS,
  ): Promise<BinanceP2pOfferPick[]> {
    const aggregated: BinanceP2pOfferPick[] = [];
    const maxPages =
      rows > BINANCE_P2P_SEARCH_MAX_ROWS
        ? Math.min(BINANCE_PARSER_MAX_PAGES, Math.ceil(rows / BINANCE_P2P_SEARCH_MAX_ROWS))
        : BINANCE_PARSER_MAX_PAGES;
    for (let page = 1; page <= maxPages; page++) {
      const chunk = await this.fetchBuyUsdtOffersPage(fiat, payTypes, page, BINANCE_P2P_SEARCH_MAX_ROWS);
      aggregated.push(...chunk);
      if (chunk.length < BINANCE_P2P_SEARCH_MAX_ROWS) break;
    }
    return aggregated;
  }

  private async fetchBuyUsdtOffersPage(
    fiat: string,
    payTypes: string[],
    page: number,
    rowsPerPage: number,
  ): Promise<BinanceP2pOfferPick[]> {
    const safeRows = Math.min(Math.max(1, rowsPerPage), BINANCE_P2P_SEARCH_MAX_ROWS);
    // Binance rejects `payTypes: []` with code 000002 (illegal parameter). Omit the field to mean "all payment methods".
    const body: Record<string, unknown> = {
      asset: 'USDT',
      fiat,
      merchantCheck: false,
      page,
      publisherType: null as string | null,
      rows: safeRows,
      tradeType: 'BUY',
    };
    if (payTypes.length > 0) {
      body.payTypes = payTypes;
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.http.webhookFetchTimeoutMs);
    try {
      const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json()) as {
        code?: string;
        data?: BinanceAdvSearchRow[];
        message?: string;
      };
      if (json.code !== '000000' || !Array.isArray(json.data)) {
        logExternalFailure(this.logger, {
          integration: 'Binance P2P',
          operation: 'adv/search',
          context: { fiat, page, binanceCode: json.code },
          error: new Error(json.message ?? `unexpected response code ${json.code}`),
          level: 'warn',
        });
        return [];
      }
      return json.data.filter(isNonPrivilegedBinanceRow).map(adRowToPick);
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'Binance P2P',
        operation: 'adv/search',
        context: { fiat, page },
        error: e,
        level: 'warn',
      });
      return [];
    } finally {
      clearTimeout(t);
    }
  }

  parsePayTypesCsv(csv: string): string[] {
    return csv.split(',').map((s) => s.trim()).filter(Boolean);
  }

  getConfiguredPayTypes(): string[] {
    return this.parsePayTypesCsv(config.binanceP2p.payTypes);
  }

  getSecondaryPairPayTypes(): string[] {
    return this.parsePayTypesCsv(config.binanceP2p.secondaryPairPayTypes ?? '');
  }
}

function adRowToPick(row: BinanceAdvSearchRow): BinanceP2pOfferPick {
  const adv = row.adv;
  const methods = adv.tradeMethods ?? [];
  const payTypeLabels = methods.map((m) => m.payType || m.tradeMethodName || '').filter(Boolean);
  return {
    price: parseFloat(adv.price),
    nickName: row.advertiser?.nickName ?? '',
    minFiat: parseFloat(adv.minSingleTransAmount),
    maxFiat: parseFloat(adv.maxSingleTransAmount),
    payTypeLabels,
  };
}

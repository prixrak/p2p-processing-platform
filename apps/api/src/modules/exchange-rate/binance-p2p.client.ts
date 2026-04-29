import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';
import type { BinanceP2pOfferPick } from '@p2p/shared';

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

  async fetchBuyUsdtOffers(
    fiat: string,
    payTypes: string[],
    rows = 50,
  ): Promise<BinanceP2pOfferPick[]> {
    const body = {
      asset: 'USDT',
      fiat,
      merchantCheck: false,
      page: 1,
      payTypes: payTypes.length > 0 ? payTypes : [],
      publisherType: null as string | null,
      rows,
      tradeType: 'BUY',
    };

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
        this.logger.warn(`Binance P2P search failed: code=${json.code} msg=${json.message}`);
        return [];
      }
      return json.data.filter(isNonPrivilegedBinanceRow).map(adRowToPick);
    } catch (e) {
      this.logger.warn(`Binance P2P fetch error: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    } finally {
      clearTimeout(t);
    }
  }

  getConfiguredPayTypes(): string[] {
    return config.binanceP2p.payTypes.split(',').map((s) => s.trim()).filter(Boolean);
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

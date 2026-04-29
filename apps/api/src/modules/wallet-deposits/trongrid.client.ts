import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';

type Trc20Row = {
  transaction_id?: string;
  from?: string;
  to?: string;
  value?: string;
  block_timestamp?: number;
};

/**
 * Minimal TronGrid REST client for USDT TRC-20 incoming transfers (Block 5 §10.5).
 */
@Injectable()
export class TrongridClient {
  private readonly logger = new Logger(TrongridClient.name);

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.tron.apiKey) {
      h['TRON-PRO-API-KEY'] = config.tron.apiKey;
    }
    return h;
  }

  async getNowBlockNumber(): Promise<number | null> {
    const url = `${config.tron.baseUrl}/wallet/getnowblock`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: '{}',
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        block_header?: { raw_data?: { number?: number } };
      };
      const n = j.block_header?.raw_data?.number;
      return typeof n === 'number' ? n : null;
    } catch (e) {
      this.logger.warn(`Tron getnowblock failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async getTxBlockNumber(txId: string): Promise<number | null> {
    const url = `${config.tron.baseUrl}/wallet/gettransactioninfobyid`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ value: txId }),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { blockNumber?: number };
      return typeof j.blockNumber === 'number' ? j.blockNumber : null;
    } catch (e) {
      this.logger.debug(`Tron gettransactioninfobyid ${txId}: ${e}`);
      return null;
    }
  }

  /**
   * Confirmed TRC-20 transfers involving `address` (mainnet USDT contract).
   */
  async listRecentUsdtTrc20(address: string): Promise<Trc20Row[]> {
    const contract = config.tron.usdtTrc20Contract;
    const limit = Math.min(200, Math.max(5, config.tron.trc20FetchLimit));
    const url = new URL(`${config.tron.baseUrl}/v1/accounts/${address}/transactions/trc20`);
    url.searchParams.set('only_confirmed', 'true');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('contract_address', contract);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(`TronGrid trc20 list ${res.status} for ${address}`);
        return [];
      }
      const j = (await res.json()) as { data?: Trc20Row[] };
      return Array.isArray(j.data) ? j.data : [];
    } catch (e) {
      this.logger.warn(`TronGrid trc20 fetch failed: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }
}

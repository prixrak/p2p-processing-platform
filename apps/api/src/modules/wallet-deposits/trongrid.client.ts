import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';
import {
  logExternalFailure,
  logHttpResponseFailure,
} from '../../common/utils/external-error-log';

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
      if (!res.ok) {
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'wallet/getnowblock',
          context: { baseUrl: config.tron.baseUrl },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        return null;
      }
      const j = (await res.json()) as {
        block_header?: { raw_data?: { number?: number } };
      };
      const n = j.block_header?.raw_data?.number;
      return typeof n === 'number' ? n : null;
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'wallet/getnowblock',
        context: { baseUrl: config.tron.baseUrl },
        error: e,
        level: 'warn',
      });
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
      if (!res.ok) {
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'wallet/gettransactioninfobyid',
          context: { baseUrl: config.tron.baseUrl, txIdPrefix: txId.slice(0, 12) },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        return null;
      }
      const j = (await res.json()) as { blockNumber?: number };
      return typeof j.blockNumber === 'number' ? j.blockNumber : null;
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'wallet/gettransactioninfobyid',
        context: { baseUrl: config.tron.baseUrl, txIdPrefix: txId.slice(0, 12) },
        error: e,
        level: 'warn',
      });
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
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'v1/accounts/.../transactions/trc20',
          context: {
            baseUrl: config.tron.baseUrl,
            addressPrefix: `${address.slice(0, 6)}…${address.slice(-4)}`,
          },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        return [];
      }
      const j = (await res.json()) as { data?: Trc20Row[] };
      return Array.isArray(j.data) ? j.data : [];
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'v1/accounts/.../transactions/trc20',
        context: {
          baseUrl: config.tron.baseUrl,
          addressPrefix: `${address.slice(0, 6)}…${address.slice(-4)}`,
        },
        error: e,
        level: 'warn',
      });
      return [];
    }
  }
}

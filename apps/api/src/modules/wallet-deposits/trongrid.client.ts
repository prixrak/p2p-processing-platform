import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';
import bs58check from 'bs58check';
import {
  logExternalFailure,
  logHttpResponseFailure,
} from '../../common/utils/external-error-log';
import { encodeTrc20BalanceOfParameter } from '../wallet-sweep/tron-sweep-transaction.util';

type Trc20Row = {
  transaction_id?: string;
  from?: string;
  to?: string;
  value?: string;
  block_timestamp?: number;
};

export type TronContractTransferRow = {
  transaction_id: string;
  block_number: number;
  from_base58: string;
  to_base58: string;
  value_raw: string;
};

function pickResultString(result: unknown, keys: string[]): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const o = result as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** Normalize TronGrid log addresses (hex or base58) to mainnet base58. */
export function normalizeTronAddress(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.startsWith('T') && s.length >= 34) return s;
  let hex = s.startsWith('0x') ? s.slice(2) : s;
  if (/^[0-9a-fA-F]{40}$/.test(hex)) {
    hex = '41' + hex;
  }
  try {
    const buf = Buffer.from(hex, 'hex');
    if (buf.length === 21 && buf[0] === 0x41) {
      return bs58check.encode(buf);
    }
    return null;
  } catch {
    return null;
  }
}

function parseContractTransferEvent(raw: {
  transaction_id?: string;
  block_number?: number;
  result?: unknown;
}): TronContractTransferRow | null {
  const txId = raw.transaction_id;
  const blockNo = raw.block_number;
  if (!txId || typeof blockNo !== 'number') return null;
  const fromRaw = pickResultString(raw.result, ['from', '0', 'sender']);
  const toRaw = pickResultString(raw.result, ['to', '1', 'recipient']);
  const valueRaw = pickResultString(raw.result, ['value', '2']);
  if (!fromRaw || !toRaw || valueRaw === undefined) return null;
  const from_base58 = normalizeTronAddress(fromRaw);
  const to_base58 = normalizeTronAddress(toRaw);
  if (!from_base58 || !to_base58) return null;
  return { transaction_id: txId, block_number: blockNo, from_base58, to_base58, value_raw: valueRaw };
}

/**
 * `GET /v1/accounts/:address/tokens` is not implemented on public Nile TronGrid (HTTP 404).
 * The client uses contract `balanceOf` for balances when this returns false.
 */
export function trongridSupportsV1AccountTokens(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl.trim()).hostname.toLowerCase();
    return host !== 'nile.trongrid.io';
  } catch {
    return true;
  }
}

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
   * Paginates with TronGrid `fingerprint` up to `maxPages` (default from config).
   */
  async listRecentUsdtTrc20(address: string, maxPages?: number): Promise<Trc20Row[]> {
    const account = address?.trim() ?? '';
    if (!account) {
      return [];
    }
    const contract = config.tron.usdtTrc20Contract;
    const limit = Math.min(200, Math.max(5, config.tron.trc20FetchLimit));
    const pages = Math.max(1, Math.min(20, maxPages ?? config.tron.trc20FetchMaxPages));
    const merged: Trc20Row[] = [];
    const seen = new Set<string>();
    let fingerprint: string | undefined;

    for (let page = 0; page < pages; page++) {
      const { rows, nextFingerprint } = await this.fetchUsdtTrc20Page(account, contract, limit, fingerprint);
      for (const row of rows) {
        const txId = row.transaction_id ?? '';
        const key = txId || JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
      }
      if (!nextFingerprint) break;
      fingerprint = nextFingerprint;
    }
    return merged;
  }

  private async fetchUsdtTrc20Page(
    account: string,
    contract: string,
    limit: number,
    fingerprint?: string,
  ): Promise<{ rows: Trc20Row[]; nextFingerprint?: string }> {
    const url = new URL(`${config.tron.baseUrl}/v1/accounts/${account}/transactions/trc20`);
    url.searchParams.set('only_confirmed', 'true');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('contract_address', contract);
    url.searchParams.set('order_by', 'block_timestamp,desc');
    if (fingerprint) {
      url.searchParams.set('fingerprint', fingerprint);
    }

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
            addressPrefix: `${account.slice(0, 6)}…${account.slice(-4)}`,
          },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        return { rows: [] };
      }
      const j = (await res.json()) as {
        data?: Trc20Row[];
        meta?: { fingerprint?: string; next_fingerprint?: string };
      };
      const rows = Array.isArray(j.data) ? j.data : [];
      const nextFingerprint = j.meta?.fingerprint ?? j.meta?.next_fingerprint;
      return { rows, nextFingerprint: nextFingerprint || undefined };
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'v1/accounts/.../transactions/trc20',
        context: {
          baseUrl: config.tron.baseUrl,
          addressPrefix: `${account.slice(0, 6)}…${account.slice(-4)}`,
        },
        error: e,
        level: 'warn',
      });
      return { rows: [] };
    }
  }

  /**
   * Recent confirmed USDT TRC-20 Transfer events on the contract (TZ Monitor §2.1).
   * Fetches up to `maxPages` TronGrid pages using `fingerprint` pagination.
   */
  async collectUsdtTransferEvents(maxPages: number): Promise<TronContractTransferRow[]> {
    const merged: TronContractTransferRow[] = [];
    const seen = new Set<string>();
    let fp: string | undefined;
    const pages = Math.max(1, Math.min(50, maxPages));
    for (let i = 0; i < pages; i++) {
      const { rows, nextFingerprint } = await this.fetchUsdtTransferEventsPage(fp);
      for (const r of rows) {
        const k = `${r.transaction_id}:${r.to_base58}`;
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(r);
      }
      if (!nextFingerprint) break;
      fp = nextFingerprint;
    }
    return merged;
  }

  private async fetchUsdtTransferEventsPage(fingerprint?: string): Promise<{
    rows: TronContractTransferRow[];
    nextFingerprint?: string;
  }> {
    const contract = config.tron.usdtTrc20Contract;
    const url = new URL(`${config.tron.baseUrl}/v1/contracts/${contract}/events`);
    url.searchParams.set('only_confirmed', 'true');
    url.searchParams.set('event_name', 'Transfer');
    url.searchParams.set('limit', '200');
    if (fingerprint) {
      url.searchParams.set('fingerprint', fingerprint);
    }

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) {
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'v1/contracts/.../events',
          context: { baseUrl: config.tron.baseUrl, contract },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        return { rows: [] };
      }
      const j = (await res.json()) as {
        data?: unknown[];
        meta?: { fingerprint?: string; next_fingerprint?: string };
      };
      const rows: TronContractTransferRow[] = [];
      if (Array.isArray(j.data)) {
        for (const item of j.data) {
          const parsed = parseContractTransferEvent(
            item as { transaction_id?: string; block_number?: number; result?: unknown },
          );
          if (parsed) rows.push(parsed);
        }
      }
      const nextFingerprint = j.meta?.fingerprint ?? j.meta?.next_fingerprint;
      return { rows, nextFingerprint: nextFingerprint || undefined };
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'v1/contracts/.../events',
        context: { baseUrl: config.tron.baseUrl },
        error: e,
        level: 'warn',
      });
      return { rows: [] };
    }
  }

  /** Native TRX balance for `address` (human units, 6 dp). */
  async getAccountTrxBalance(address: string): Promise<number | null> {
    const account = address?.trim() ?? '';
    if (!account) {
      return null;
    }
    const url = new URL(`${config.tron.baseUrl}/v1/accounts/${account}`);
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) {
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'v1/accounts (trx)',
          context: { baseUrl: config.tron.baseUrl },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        return null;
      }
      const j = (await res.json()) as { data?: { balance?: number | string }[] };
      const raw = j.data?.[0]?.balance;
      if (raw === undefined || raw === null) return 0;
      const n = Number(raw) / 1e6;
      return Number.isFinite(n) ? n : null;
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'v1/accounts (trx)',
        context: { baseUrl: config.tron.baseUrl },
        error: e,
        level: 'warn',
      });
      return null;
    }
  }

  /**
   * Canonical outcome after a tx is included (for sweep confirmation).
   * Returns null if the tx is not yet finalized or TronGrid has no record.
   */
  async getTransactionOutcome(txId: string): Promise<{
    blockNumber: number;
    feeSun: number;
    receiptResult: string;
  } | null> {
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
      const j = (await res.json()) as {
        blockNumber?: number;
        fee?: number;
        receipt?: { result?: string };
        resMessage?: string;
      };
      const blockNumber = j.blockNumber;
      if (typeof blockNumber !== 'number') {
        return null;
      }
      const receiptResult =
        typeof j.receipt?.result === 'string' && j.receipt.result.length > 0
          ? j.receipt.result
          : typeof j.resMessage === 'string' && j.resMessage.length > 0
            ? j.resMessage
            : 'UNKNOWN';
      const feeRaw = j.fee;
      const feeSun = typeof feeRaw === 'number' && Number.isFinite(feeRaw) ? feeRaw : 0;
      return { blockNumber, feeSun, receiptResult };
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

  /** On-chain USDT TRC-20 balance for `address` (human units, 6 dp). */
  async getAccountUsdtTrc20Balance(address: string): Promise<number | null> {
    const account = address?.trim() ?? '';
    if (!account) {
      return null;
    }
    if (!trongridSupportsV1AccountTokens(config.tron.baseUrl)) {
      return this.getUsdtTrc20BalanceViaBalanceOfCall(account);
    }
    const url = new URL(`${config.tron.baseUrl}/v1/accounts/${account}/tokens`);
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          data?: { token_address?: string; tokenAddress?: string; balance?: string }[];
        };
        const contract = config.tron.usdtTrc20Contract.toLowerCase();
        for (const row of j.data ?? []) {
          const rowAddr = (row.token_address ?? row.tokenAddress ?? '').toLowerCase();
          if (rowAddr === contract || rowAddr.endsWith(contract.slice(2))) {
            const raw = row.balance;
            if (raw === undefined) return 0;
            const n = Number(raw) / 1e6;
            return Number.isFinite(n) ? n : null;
          }
        }
        return 0;
      }
      logHttpResponseFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'v1/accounts/.../tokens',
        context: { baseUrl: config.tron.baseUrl },
        status: res.status,
        statusText: res.statusText,
        level: 'warn',
      });
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'v1/accounts/.../tokens',
        context: { baseUrl: config.tron.baseUrl },
        error: e,
        level: 'warn',
      });
    }
    return this.getUsdtTrc20BalanceViaBalanceOfCall(account);
  }

  /**
   * Some networks (e.g. Nile on trongrid.io) omit `GET /v1/accounts/.../tokens`; fall back to `balanceOf`.
   * Matches mainnet USDT-style 6 decimals.
   */
  private async getUsdtTrc20BalanceViaBalanceOfCall(address: string): Promise<number | null> {
    if (!address.startsWith('T')) return null;
    const url = `${config.tron.baseUrl}/wallet/triggerconstantcontract`;
    try {
      let parameter: string;
      try {
        parameter = encodeTrc20BalanceOfParameter(address);
      } catch {
        return null;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          owner_address: address,
          contract_address: config.tron.usdtTrc20Contract,
          function_selector: 'balanceOf(address)',
          parameter,
          visible: true,
        }),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) {
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'wallet/triggerconstantcontract balanceOf',
          context: { baseUrl: config.tron.baseUrl },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        return null;
      }
      const j = (await res.json()) as { constant_result?: string[] };
      const hex = j.constant_result?.[0];
      if (!hex || typeof hex !== 'string') return null;
      const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
      if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length < 1) return null;
      const raw = BigInt('0x' + normalized);
      const n = Number(raw) / 1e6;
      return Number.isFinite(n) ? n : null;
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'wallet/triggerconstantcontract balanceOf',
        context: { baseUrl: config.tron.baseUrl },
        error: e,
        level: 'warn',
      });
      return null;
    }
  }

  /** Builds an unsigned TRC-20 contract call (`wallet/triggersmartcontract`). Caller supplies ABI-encoded parameter hex. */
  async triggerSmartContract(params: {
    ownerAddressBase58: string;
    contractAddressBase58: string;
    functionSelector: string;
    parameterHexNoPrefix: string;
    feeLimit: number;
    callValue?: number;
  }): Promise<Record<string, unknown>> {
    const url = `${config.tron.baseUrl}/wallet/triggersmartcontract`;
    const body = {
      owner_address: params.ownerAddressBase58,
      contract_address: params.contractAddressBase58,
      function_selector: params.functionSelector,
      parameter: params.parameterHexNoPrefix,
      fee_limit: params.feeLimit,
      call_value: params.callValue ?? 0,
      visible: true,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) {
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'wallet/triggersmartcontract',
          context: {
            baseUrl: config.tron.baseUrl,
            ownerPrefix: params.ownerAddressBase58.slice(0, 6),
          },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        throw new Error(`triggerSmartContract failed: HTTP ${res.status}`);
      }
      const j = (await res.json()) as Record<string, unknown>;
      if (!j.transaction) {
        const trimmed = JSON.stringify(j.result ?? j).slice(0, 800);
        this.logger.warn(`triggerSmartContract: no transaction (${trimmed})`);
        throw new Error('triggerSmartContract: missing transaction');
      }
      return j;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('trigger')) {
        throw e;
      }
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'wallet/triggersmartcontract',
        context: { baseUrl: config.tron.baseUrl },
        error: e,
        level: 'warn',
      });
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async broadcastSignedTransaction(transaction: Record<string, unknown>): Promise<{ txId: string; raw: unknown }> {
    const url = `${config.tron.baseUrl}/wallet/broadcasttransaction`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(transaction),
        signal: AbortSignal.timeout(config.http.webhookFetchTimeoutMs),
      });
      if (!res.ok) {
        logHttpResponseFailure(this.logger, {
          integration: 'TronGrid',
          operation: 'wallet/broadcasttransaction',
          context: { baseUrl: config.tron.baseUrl },
          status: res.status,
          statusText: res.statusText,
          level: 'warn',
        });
        throw new Error(`broadcasttransaction failed: HTTP ${res.status}`);
      }
      const j = (await res.json()) as {
        result?: boolean;
        code?: string;
        message?: string;
        txid?: string;
        txID?: string;
      };
      if (j.result === false || (j.code && j.code !== 'SUCCESS')) {
        throw new Error(j.message || j.code || 'broadcasttransaction rejected');
      }
      const txId = j.txid || j.txID;
      if (typeof txId !== 'string' || !txId.length) {
        throw new Error('broadcasttransaction response missing txid');
      }
      return { txId, raw: j };
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'TronGrid',
        operation: 'wallet/broadcasttransaction',
        context: { baseUrl: config.tron.baseUrl },
        error: e,
        level: 'warn',
      });
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
}

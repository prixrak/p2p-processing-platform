import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';
import { logExternalFailure } from '../../common/utils/external-error-log';

/** ERC-20 Transfer(address indexed from, address indexed to, uint256 value). */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export type EthLog = {
  transactionHash: string;
  blockNumber: string;
  data: string;
  topics: string[];
};

/**
 * Minimal Ethereum JSON-RPC client for eth_blockNumber / eth_getLogs (Infura, Alchemy, self-hosted).
 */
@Injectable()
export class EthereumJsonRpcClient {
  private readonly logger = new Logger(EthereumJsonRpcClient.name);

  assertConfigured(): void {
    if (!config.ethereum.rpcUrl.trim()) {
      throw new Error('ETH_RPC_URL is not set');
    }
  }

  async ethBlockNumber(): Promise<number> {
    const hex = await this.callRpc<string>('eth_blockNumber', []);
    return Number.parseInt(hex, 16);
  }

  async ethGetLogs(filter: {
    fromBlock: number;
    toBlock: number;
    address: string;
    topics: (string | null)[];
  }): Promise<EthLog[]> {
    const fromHex = '0x' + filter.fromBlock.toString(16);
    const toHex = '0x' + filter.toBlock.toString(16);
    const logs = await this.callRpc<EthLog[] | null>('eth_getLogs', [
      {
        fromBlock: fromHex,
        toBlock: toHex,
        address: filter.address.toLowerCase(),
        topics: filter.topics,
      },
    ]);
    return Array.isArray(logs) ? logs : [];
  }

  private async callRpc<T>(method: string, params: unknown[]): Promise<T> {
    const url = config.ethereum.rpcUrl.trim();
    if (!url) {
      throw new Error('ETH_RPC_URL is not set');
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      const json = (await res.json()) as {
        result?: T;
        error?: { message?: string };
      };
      if (json.error?.message) {
        throw new Error(json.error.message);
      }
      return json.result as T;
    } catch (e) {
      logExternalFailure(this.logger, {
        integration: 'Ethereum JSON-RPC',
        operation: method,
        context: { rpcHost: safeUrlOrigin(url) },
        error: e,
        level: 'warn',
      });
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

/** topic[2] for filtering incoming transfers to `addr`. */
export function padTopicAddress(addr: string): string {
  const hex = addr.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error('Invalid Ethereum address');
  }
  return '0x' + hex.padStart(64, '0');
}

function safeUrlOrigin(urlStr: string): string {
  try {
    return new URL(urlStr).origin;
  } catch {
    return 'invalid-url';
  }
}

export function decodeUint256Data(hexData: string): bigint {
  const h = hexData.startsWith('0x') ? hexData.slice(2) : hexData;
  return BigInt('0x' + (h || '0'));
}

import { createHash } from 'crypto';
import bs58check from 'bs58check';

/**
 * ABI-encodes only the argument tuple for `transfer(address,uint256)` as required by `wallet/triggersmartcontract`
 * when `function_selector` is set separately (no 4-byte selector prefix here).
 */
/** ABI-encodes `balanceOf(address)` argument (no 4-byte selector) for `wallet/triggerconstantcontract`. */
export function encodeTrc20BalanceOfParameter(accountTronBase58: string): string {
  if (!accountTronBase58.startsWith('T')) {
    throw new Error('TRON account must be base58 (T…) for visible=true triggers');
  }
  const decoded = bs58check.decode(accountTronBase58);
  const payload = Buffer.isBuffer(decoded) ? decoded : Buffer.from(decoded);
  if (payload.length !== 21 || payload[0] !== 0x41) {
    throw new Error('Decoded TRON address must be 21 bytes prefixed with 0x41');
  }
  const addrWord = Buffer.alloc(32);
  payload.subarray(1).copy(addrWord, 12);
  return addrWord.toString('hex');
}

export function encodeTronTrc20TransferParameter(toTronBase58Address: string, amountSun: number): string {
  if (!toTronBase58Address.startsWith('T')) {
    throw new Error('TRON recipient must be base58 (T…) for visible=true triggers');
  }
  if (!Number.isFinite(amountSun) || amountSun <= 0) {
    throw new Error('USDT SUN amount must be a positive finite number');
  }
  const amt = BigInt(Math.floor(amountSun));
  const decoded = bs58check.decode(toTronBase58Address);
  const payload = Buffer.isBuffer(decoded) ? decoded : Buffer.from(decoded);
  if (payload.length !== 21 || payload[0] !== 0x41) {
    throw new Error('Decoded TRON address must be 21 bytes prefixed with 0x41');
  }
  const addrWord = Buffer.alloc(32);
  payload.subarray(1).copy(addrWord, 12);
  const amtWord = bigIntToUint256BE(amt);
  return Buffer.concat([addrWord, amtWord]).toString('hex');
}

function bigIntToUint256BE(value: bigint): Buffer {
  if (value <= 0n || value >= 2n ** 256n) {
    throw new Error('Amount out of uint256 range');
  }
  const out = Buffer.alloc(32);
  let v = value;
  for (let i = 31; i >= 0 && v > 0n; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** SHA256(protobuf raw_data bytes) — transaction id / signing digest on TRON. */
export function digestOfTronRawDataHex(rawDataHex: string): Buffer {
  const hex = rawDataHex.startsWith('0x') ? rawDataHex.slice(2) : rawDataHex;
  if (hex.length % 2 !== 0) {
    throw new Error('raw_data_hex must be even-length hex');
  }
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest();
}

export function unsignedTxFromTriggerResponse(body: Record<string, unknown>): Record<string, unknown> {
  const nested = body.transaction;
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>;
  }
  if (typeof body.raw_data_hex === 'string') {
    return body;
  }
  throw new Error('TronGrid triggersmartcontract response missing transaction');
}

/**
 * Attaches a single 65-byte recoverable ECDSA signature (130 hex chars) returned by the Vault tron-sign engine.
 */
export function applySignatureHexToUnsigned(
  unsigned: Record<string, unknown>,
  signatureHex130: string,
): Record<string, unknown> {
  const sig = normalizeSignatureHex(signatureHex130);
  if (sig.length !== 130) {
    throw new Error('TRON signature must be 65 bytes (130 hex chars)');
  }
  return {
    ...unsigned,
    signature: [sig],
  };
}

function normalizeSignatureHex(sig: string): string {
  const s = sig.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(s)) {
    throw new Error('signature must be hex');
  }
  return s;
}

import { ExternalApiHeaders } from '@p2p/shared';

const enc = new TextEncoder();

function bytesToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** UTF-8 bytes → base64 (safe for any Unicode in JSON). */
export function utf8ToBase64(str: string): string {
  const bytes = enc.encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/** Inverse of utf8ToBase64 — wire body must decode to match X-API-PAYLOAD. */
export function utf8FromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function hmacSha512Hex(secret: string, messageUtf8: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(messageUtf8));
  return bytesToHex(sig);
}

/**
 * Same merge the server uses for JSON: v2 adds `api_url` and requires `nonce` (Unix seconds if omitted).
 * `nowSecForMissingNonce` is only for UI preview when you want a stable value; omit on real sends.
 */
export function mergeJsonForSigning(
  body: Record<string, unknown>,
  apiUrl: string,
  useV2: boolean,
  nowSecForMissingNonce?: number,
): Record<string, unknown> {
  if (!useV2) return { ...body };
  const nowSec = nowSecForMissingNonce ?? Math.floor(Date.now() / 1000);
  return {
    ...body,
    api_url: apiUrl,
    nonce: typeof body.nonce === 'number' ? body.nonce : nowSec,
  };
}

/**
 * Match `scripts/p2p-external-hmac-headers.mjs` and Node `createHmac('sha512', secret).update(apiPayload).digest('hex')`
 * where `apiPayload` is the base64 string (HMAC input is UTF-8 of that string).
 */
export async function buildSignedJsonRequest(opts: {
  publicKey: string;
  secret: string;
  body: Record<string, unknown>;
  apiUrl: string;
  useV2: boolean;
}): Promise<{ headers: Record<string, string>; bodyString: string }> {
  const merged = mergeJsonForSigning(opts.body, opts.apiUrl, opts.useV2);

  const bodyString = JSON.stringify(merged);
  const apiPayload = utf8ToBase64(bodyString);
  const signature = await hmacSha512Hex(opts.secret, apiPayload);

  return {
    bodyString,
    headers: {
      'Content-Type': 'application/json',
      [ExternalApiHeaders.API_KEY]: opts.publicKey,
      [ExternalApiHeaders.API_PAYLOAD]: apiPayload,
      [ExternalApiHeaders.API_SIGNATURE]: signature,
    },
  };
}

/** Multipart: guard expects base64(formula) then HMAC over that base64 string. */
export async function buildMultipartAuthHeaders(opts: {
  publicKey: string;
  secret: string;
  /** Semicolon-separated line, e.g. `id=...;status=...;nonce=...` */
  formula: string;
}): Promise<{ headers: Record<string, string> }> {
  const apiPayload = utf8ToBase64(opts.formula);
  const signature = await hmacSha512Hex(opts.secret, apiPayload);
  return {
    headers: {
      [ExternalApiHeaders.API_KEY]: opts.publicKey,
      [ExternalApiHeaders.API_PAYLOAD]: apiPayload,
      [ExternalApiHeaders.API_SIGNATURE]: signature,
    },
  };
}

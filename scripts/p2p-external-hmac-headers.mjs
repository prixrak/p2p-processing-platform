/**
 * Build HMAC headers for POST /api/external/v1/payin/* and /api/external/v1/payout/*.
 *
 * Server expects:
 * - X-API-PAYLOAD = base64(UTF-8 body string)
 * - X-API-SIGNATURE = hex( HMAC-SHA512( key, x_api_payload_string ) )
 * - With non-empty `api_url` in JSON body, the API uses the plaintext `secret` as HMAC key (v2).
 *
 * Usage (Node 18+):
 *   import { buildP2pExternalHmacHeaders } from './scripts/p2p-external-hmac-headers.mjs';
 *   const { headers, bodyString } = buildP2pExternalHmacHeaders({
 *     publicKey: 'pk_payin_...',
 *     secret: 'sk_payin_...',
 *     body: { request_id: '1', amount: 100, currency: 'UAH', user_full_name: 'Test', nonce: Math.floor(Date.now()/1000) },
 *     apiUrl: '/api/external/v1/payin/upload_order',
 *   });
 *   await fetch('http://localhost:3001/api/external/v1/payin/upload_order', {
 *     method: 'POST',
 *     headers: { ...headers },
 *     body: bodyString,
 *   });
 *
 * CLI (prints JSON with headers + body string):
 *   cd <repo-root>
 *   P2P_PUBLIC_KEY=pk_payin_... P2P_SECRET=sk_payin_... node scripts/p2p-external-hmac-headers.mjs
 * Optional: P2P_API_URL=/api/external/v1/payout/order_upload  P2P_BODY_JSON='{"request_id":"1",...}'
 *
 * Or use the import example: `scripts/example-external-hmac.mjs` / `npm run hmac:example`
 */

import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  EXTERNAL_API_V1_PREFIX,
  ExternalApiHeaders,
} from './external-api-contract.mjs';

/**
 * @param {object} opts
 * @param {string} opts.publicKey
 * @param {string} opts.secret - Plaintext secret (sk_payin_... / sk_payout_...)
 * @param {Record<string, unknown> | string} opts.body - Exact JSON object or pre-serialized string
 * @param {string} [opts.apiUrl] - Path or full URL for HMAC v2 (merged as `api_url`); must match this request.
 */
export function buildP2pExternalHmacHeaders({ publicKey, secret, body, apiUrl }) {
  let bodyString;
  if (typeof body === 'string') {
    bodyString = body;
  } else {
    const merged =
      apiUrl && typeof body === 'object' && body !== null && !('api_url' in body)
        ? { ...body, api_url: apiUrl }
        : body;
    bodyString = JSON.stringify(merged);
  }

  const apiPayload = Buffer.from(bodyString, 'utf8').toString('base64');
  const signature = createHmac('sha512', secret).update(apiPayload).digest('hex');

  return {
    headers: {
      'Content-Type': 'application/json',
      [ExternalApiHeaders.API_KEY]: publicKey,
      [ExternalApiHeaders.API_PAYLOAD]: apiPayload,
      [ExternalApiHeaders.API_SIGNATURE]: signature,
    },
    bodyString,
  };
}

/** Run: `node scripts/p2p-external-hmac-headers.mjs` from repo root (Node 18+). */
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const publicKey = process.env.P2P_PUBLIC_KEY;
  const secret = process.env.P2P_SECRET;
  const apiUrl =
    process.env.P2P_API_URL ?? `${EXTERNAL_API_V1_PREFIX}/payin/upload_order`;

  if (!publicKey || !secret) {
    console.error(
      'Set env: P2P_PUBLIC_KEY, P2P_SECRET (and optionally P2P_API_URL, P2P_BODY_JSON).',
    );
    console.error(
      'Example:\n  P2P_PUBLIC_KEY=pk_payin_xxx P2P_SECRET=sk_payin_yyy node scripts/p2p-external-hmac-headers.mjs',
    );
    process.exit(1);
  }

  let body;
  if (process.env.P2P_BODY_JSON) {
    body = JSON.parse(process.env.P2P_BODY_JSON);
  } else {
    body = {
      request_id: `demo-${Date.now()}`,
      amount: 1000,
      currency: 'UAH',
      user_full_name: 'Demo User',
      nonce: Math.floor(Date.now() / 1000),
    };
  }

  const out = buildP2pExternalHmacHeaders({ publicKey, secret, body, apiUrl });
  console.log(JSON.stringify({ headers: out.headers, body: out.bodyString }, null, 2));
}

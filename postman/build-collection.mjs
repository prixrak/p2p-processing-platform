/**
 * Generates Postman Collection v2.1 JSON (run: node postman/build-collection.mjs)
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  EXTERNAL_API_V1_PREFIX,
  ExternalApiHeaders,
} from "../scripts/external-api-contract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const hmacPrerequest = [
  "const CryptoJS = require('crypto-js');",
  "const url = pm.request.url.toString();",
  "if (!url.includes('/external/v1/')) { return; }",
  "const ct = (pm.request.headers.get('Content-Type') || '').toLowerCase();",
  "if (ct.includes('multipart/form-data')) { return; }",
  "if (pm.request.body == null || pm.request.body.mode !== 'raw') { return; }",
  "let raw = pm.request.body.raw;",
  "if (raw == null || String(raw).trim() === '') { raw = '{}'; }",
  "let body;",
  "try { body = JSON.parse(raw); } catch (e) { console.error('Invalid JSON body', e); return; }",
  "if (body.nonce === undefined || body.nonce === null) {",
  "  body.nonce = Math.floor(Date.now() / 1000);",
  "}",
  "const newRaw = JSON.stringify(body);",
  "pm.request.body.update({ mode: 'raw', raw: newRaw });",
  "const apiPayload = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(newRaw));",
  "const isPayout = url.includes('/payout/');",
  "const secret = isPayout ? pm.collectionVariables.get('payout_secret') : pm.collectionVariables.get('payin_secret');",
  "const pub = isPayout ? pm.collectionVariables.get('payout_public_key') : pm.collectionVariables.get('payin_public_key');",
  "if (!secret || !pub) { console.warn('Set payin_* or payout_* collection variables'); return; }",
  "const sig = CryptoJS.HmacSHA512(apiPayload, secret).toString(CryptoJS.enc.Hex);",
  `pm.request.headers.remove('${ExternalApiHeaders.API_KEY}');`,
  `pm.request.headers.remove('${ExternalApiHeaders.API_PAYLOAD}');`,
  `pm.request.headers.remove('${ExternalApiHeaders.API_SIGNATURE}');`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_KEY}', value: pub });`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_PAYLOAD}', value: apiPayload });`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_SIGNATURE}', value: sig });`,
];

const multipartUpdateProofs = [
  "const CryptoJS = require('crypto-js');",
  "const orderId = pm.collectionVariables.get('payin_order_id');",
  "const status = pm.collectionVariables.get('payin_update_status') || 'VERIFIED';",
  "const nonce = Math.floor(Date.now() / 1000);",
  "if (!orderId) { throw new Error('Set collection variable payin_order_id (order UUID)'); }",
  "const payloadStr = 'id=' + orderId + ';status=' + status + ';nonce=' + nonce;",
  "pm.request.body.update({",
  "  mode: 'formdata',",
  "  formdata: [",
  "    { key: 'id', value: orderId, type: 'text' },",
  "    { key: 'status', value: status, type: 'text' },",
  "    { key: 'files', type: 'file', src: '' }",
  "  ]",
  "});",
  "const apiPayload = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(payloadStr));",
  "const secret = pm.collectionVariables.get('payin_secret');",
  "const pub = pm.collectionVariables.get('payin_public_key');",
  "const sig = CryptoJS.HmacSHA512(apiPayload, secret).toString(CryptoJS.enc.Hex);",
  `pm.request.headers.remove('${ExternalApiHeaders.API_KEY}');`,
  `pm.request.headers.remove('${ExternalApiHeaders.API_PAYLOAD}');`,
  `pm.request.headers.remove('${ExternalApiHeaders.API_SIGNATURE}');`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_KEY}', value: pub });`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_PAYLOAD}', value: apiPayload });`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_SIGNATURE}', value: sig });`,
];

const multipartAppeal = [
  "const CryptoJS = require('crypto-js');",
  "const orderId = pm.collectionVariables.get('payin_appeal_order_id');",
  "const paidAmount = parseFloat(pm.collectionVariables.get('payin_appeal_paid_amount') || '0');",
  "const nonce = Date.now();",
  "if (!orderId) { throw new Error('Set collection variable payin_appeal_order_id'); }",
  "if (!paidAmount || paidAmount <= 0) { throw new Error('Set payin_appeal_paid_amount'); }",
  "const payloadStr = 'order_id=' + orderId + ';paid_amount=' + paidAmount + ';nonce=' + nonce;",
  "pm.request.body.update({",
  "  mode: 'formdata',",
  "  formdata: [",
  "    { key: 'order_id', value: orderId, type: 'text' },",
  "    { key: 'paid_amount', value: String(paidAmount), type: 'text' },",
  "    { key: 'nonce', value: String(nonce), type: 'text' },",
  "    { key: 'files', type: 'file', src: '' }",
  "  ]",
  "});",
  "const apiPayload = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(payloadStr));",
  "const secret = pm.collectionVariables.get('payin_secret');",
  "const pub = pm.collectionVariables.get('payin_public_key');",
  "const sig = CryptoJS.HmacSHA512(apiPayload, secret).toString(CryptoJS.enc.Hex);",
  `pm.request.headers.remove('${ExternalApiHeaders.API_KEY}');`,
  `pm.request.headers.remove('${ExternalApiHeaders.API_PAYLOAD}');`,
  `pm.request.headers.remove('${ExternalApiHeaders.API_SIGNATURE}');`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_KEY}', value: pub });`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_PAYLOAD}', value: apiPayload });`,
  `pm.request.headers.add({ key: '${ExternalApiHeaders.API_SIGNATURE}', value: sig });`,
];

const loginTest = [
  "if (pm.response.code === 200) {",
  "  try {",
  "    const j = pm.response.json();",
  "    if (j.accessToken) { pm.collectionVariables.set('access_token', j.accessToken); }",
  "  } catch (e) {}",
  "}",
];

function req(name, method, path, body, opts = {}) {
  const headers = [];
  if (method !== "GET") {
    headers.push({ key: "Content-Type", value: "application/json" });
  }
  if (opts.authBearer) {
    headers.push({ key: "Authorization", value: "Bearer {{access_token}}" });
  }
  const item = {
    name,
    request: {
      method,
      header: headers,
      url: {
        raw: "{{baseUrl}}" + path,
        host: ["{{baseUrl}}"],
        path: path.replace(/^\//, "").split("/"),
      },
    },
  };
  if (body !== null && body !== undefined && method !== "GET") {
    item.request.body = { mode: "raw", raw: JSON.stringify(body, null, 2) };
  }
  if (opts.events) {
    item.event = opts.events;
  }
  return item;
}

const collection = {
  info: {
    name: "P2P Processing Platform",
    description:
      "Import into Postman. Set collection variables: baseUrl (default http://localhost:3001), payin_public_key, payin_secret, payout_public_key, payout_secret. If you use db:seed, merchant API keys might have been regenerated (seed replaces undecryptable SHA256-only fingerprints) — generate fresh Pay-In/Pay-Out keys in the admin UI and paste publicKey + secretKey here. External merchant API is POST-only with HMAC-SHA512: request body JSON string, X-API-PAYLOAD = base64(UTF-8 body), X-API-SIGNATURE = hex HMAC-SHA512 of that base64 string using the plaintext signing secret (same as apps/api/src/common/utils/hmac.ts). Collection prerequest adds nonce (unix seconds) when missing. Multipart requests use per-request scripts; set payin_order_id / payin_update_status / payin_appeal_* and attach files where needed. Internal routes use Bearer access_token (saved by Auth / Login test script). Optional JSON field api_url must match the request path (or full URL path) if you add it (v2-style binding).",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3001" },
    { key: "payin_public_key", value: "" },
    { key: "payin_secret", value: "" },
    { key: "payout_public_key", value: "" },
    { key: "payout_secret", value: "" },
    { key: "access_token", value: "" },
    { key: "login_email", value: "admin@p2p.local" },
    { key: "login_password", value: "" },
    { key: "payin_order_id", value: "" },
    { key: "payin_update_status", value: "VERIFIED" },
    { key: "payin_appeal_order_id", value: "" },
    { key: "payin_appeal_paid_amount", value: "100" },
  ],
  event: [
    {
      listen: "prerequest",
      script: { type: "text/javascript", exec: hmacPrerequest },
    },
  ],
  item: [
    {
      name: "External / Pay-In (HMAC)",
      item: [
        req("upload_order", "POST", `${EXTERNAL_API_V1_PREFIX}/payin/upload_order`, {
          request_id: "postman-{{$timestamp}}",
          amount: 100,
          currency: "UAH",
          user_full_name: "Test User",
        }),
        req("update_order", "POST", `${EXTERNAL_API_V1_PREFIX}/payin/update_order`, {
          id: "00000000-0000-0000-0000-000000000000",
          status: "VERIFIED",
        }),
        {
          name: "update_order_with_proofs (multipart)",
          event: [{ listen: "prerequest", script: { type: "text/javascript", exec: multipartUpdateProofs } }],
          request: {
            method: "POST",
            header: [],
            body: {
              mode: "formdata",
              formdata: [
                { key: "id", type: "text", value: "{{payin_order_id}}" },
                { key: "status", type: "text", value: "{{payin_update_status}}" },
                { key: "files", type: "file", src: [] },
              ],
            },
            url: {
              raw: `{{baseUrl}}${EXTERNAL_API_V1_PREFIX}/payin/update_order_with_proofs`,
              host: ["{{baseUrl}}"],
              path: ["api", "external", "v1", "payin", "update_order_with_proofs"],
            },
          },
        },
        req("order_info", "POST", `${EXTERNAL_API_V1_PREFIX}/payin/order_info`, {
          id: "00000000-0000-0000-0000-000000000000",
        }),
        req("info", "POST", `${EXTERNAL_API_V1_PREFIX}/payin/info`, {}),
        req("h2h_init", "POST", `${EXTERNAL_API_V1_PREFIX}/payin/h2h_init`, {
          request_id: "h2h-{{$timestamp}}",
          amount: 100,
          currency: "UAH",
          redirect_url: "https://example.com/return",
        }),
        req("h2h_check_availability", "POST", `${EXTERNAL_API_V1_PREFIX}/payin/h2h_check_availability`, {
          request_id: "chk-{{$timestamp}}",
          amount: 100,
          currency: "UAH",
        }),
        req("banks", "POST", `${EXTERNAL_API_V1_PREFIX}/payin/banks`, { currency: "UAH" }),
        {
          name: "appeal_send (multipart)",
          event: [{ listen: "prerequest", script: { type: "text/javascript", exec: multipartAppeal } }],
          request: {
            method: "POST",
            header: [],
            body: {
              mode: "formdata",
              formdata: [
                { key: "order_id", type: "text", value: "{{payin_appeal_order_id}}" },
                { key: "paid_amount", type: "text", value: "{{payin_appeal_paid_amount}}" },
                { key: "nonce", type: "text", value: "{{$timestamp}}" },
                { key: "files", type: "file", src: [] },
              ],
            },
            url: {
              raw: `{{baseUrl}}${EXTERNAL_API_V1_PREFIX}/payin/appeal/send`,
              host: ["{{baseUrl}}"],
              path: ["api", "external", "v1", "payin", "appeal", "send"],
            },
          },
        },
      ],
    },
    {
      name: "External / Pay-Out (HMAC)",
      item: [
        req("order_upload", "POST", `${EXTERNAL_API_V1_PREFIX}/payout/order_upload`, {
          request_id: "po-{{$timestamp}}",
          currency: "UAH",
          amount: 100,
          details: { type: "CARD", number: "4111111111111111", owner: "Test" },
        }),
        req("order_info", "POST", `${EXTERNAL_API_V1_PREFIX}/payout/order_info`, {
          id: "00000000-0000-0000-0000-000000000000",
        }),
        req("info", "POST", `${EXTERNAL_API_V1_PREFIX}/payout/info`, {}),
      ],
    },
    {
      name: "Internal / Auth (JWT)",
      item: [
        {
          name: "Login",
          event: [{ listen: "test", script: { type: "text/javascript", exec: loginTest } }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                { email: "{{login_email}}", password: "{{login_password}}" },
                null,
                2,
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/auth/login",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "login"],
            },
          },
        },
        req("Refresh token", "POST", "/api/auth/refresh", {
          refreshToken: "paste-refresh-token-here",
        }),
      ],
    },
    {
      name: "Internal / Samples (JWT)",
      item: [
        req("Health", "GET", "/api/health", null, { authBearer: true }),
        req("Merchants list", "GET", "/api/merchants", null, { authBearer: true }),
        req("Directions", "GET", "/api/directions", null, { authBearer: true }),
        req("Currencies", "GET", "/api/currencies", null, { authBearer: true }),
        req("Traders", "GET", "/api/traders", null, { authBearer: true }),
      ],
    },
  ],
};

const out = join(__dirname, "P2P-Processing-Platform.postman_collection.json");
writeFileSync(out, JSON.stringify(collection, null, 2), "utf8");
console.log("Wrote", out);

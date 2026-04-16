/**
 * Example: import buildP2pExternalHmacHeaders and call with your keys.
 *
 * From repo root:
 *   P2P_PUBLIC_KEY=pk_... P2P_SECRET=sk_... node scripts/example-external-hmac.mjs
 *
 * Or edit the placeholders below (do not commit real secrets).
 */
import { buildP2pExternalHmacHeaders } from "./p2p-external-hmac-headers.mjs";

const publicKey =
  process.env.P2P_PUBLIC_KEY ??
  "pk_payin_3f864b1d695b2e2cce5a90d2841a02cfe0b2b1f6693d1c81";
const secret =
  process.env.P2P_SECRET ??
  "sk_payin_ecc0ab3b6210ec6a54e2111b6db5aff804e0a94640746e65d21700dac13ded7a";

if (!process.env.P2P_PUBLIC_KEY && publicKey.includes("REPLACE")) {
  console.error(
    "Set P2P_PUBLIC_KEY and P2P_SECRET, or edit scripts/example-external-hmac.mjs",
  );
  process.exit(1);
}

const { headers, bodyString } = buildP2pExternalHmacHeaders({
  publicKey,
  secret,
  body: {
    request_id: "postman5",
    amount: 1001,
    currency: "UAH",
    user_full_name: "Test User",
  },
  // apiUrl: `${EXTERNAL_API_V1_PREFIX}/payin/upload_order`,
});

console.log("--- headers (copy into Postman) ---");
console.log(JSON.stringify(headers, null, 2));
console.log("--- body (raw JSON) ---");
console.log(bodyString);

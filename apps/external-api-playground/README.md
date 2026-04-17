# External API playground

Local developer UI for exercising `POST /api/external/v1/*` merchant endpoints with the same HMAC-SHA512 signing rules as [`scripts/p2p-external-hmac-headers.mjs`](../../scripts/p2p-external-hmac-headers.mjs).

**Not part of the production web app.** This package is optional: it lives in its own workspace and is omitted from `build:web`.

## Security

- Intended for **local development only**.
- API keys are stored in **browser `localStorage`** (never commit secrets).
- Do not expose this tool on the public internet.

## Run

1. Start the API (e.g. from repo root: `npm run dev:api`).
2. Start the playground: `npm run dev:external-playground` from the repo root, or `npm run dev` in this folder.
3. Open the printed URL (default dev server: port **5174**).

The dev server proxies `/api` to the backend. Override the upstream with:

`EXTERNAL_PLAYGROUND_API_TARGET=http://localhost:3001`

(env file `.env` / `.env.local` in this app is supported by Vite).

## Usage

1. **Pay-In** / **Pay-Out** keys default from [`src/dev-defaults.ts`](src/dev-defaults.ts) on first load (override or clear `localStorage`). Replace with your merchant keys as needed.
2. Choose an endpoint; sample JSON / multipart fields are generated per request (fresh timestamps). With **HMAC v2**, `api_url` and `nonce` appear in the JSON editor. **Refresh nonce (updates JSON)** sets a new Unix second and writes it into the body.
3. **Signing headers** (`X-API-KEY`, `X-API-PAYLOAD`, `X-API-SIGNATURE`) are shown and editable. They auto-sync from the JSON body or multipart formula unless **Lock** is on. JSON sends use the UTF-8 body decoded from `X-API-PAYLOAD` (so the payload and body stay aligned unless you edit them independently on purpose).
4. **Send request** and read the formatted response.

Multipart endpoints (`update_order_with_proofs`, `appeal/send`) build the canonical payload string required by `HmacAuthGuard` and append `files` as in the API.

## Build

`npm run build` produces a static `dist/` bundle (useful for sanity checks; primary workflow is `npm run dev`).

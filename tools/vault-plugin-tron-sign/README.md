# Vault TRON secp256k1 signer (TZ Wallet / Sweep §3)

OSS **Vault Transit** cannot sign **secp256k1** hashes. This binary is a minimal **Vault secrets engine plugin** (same class as Kaleido `ethsign`): it stores trader keys in sealed storage and returns a **65‑byte recoverable ECDSA signature** for `SHA256(Transaction.raw_data)` using `github.com/ethereum/go-ethereum/crypto.Sign` (canonical for TRON mainnet ECDSA mode).

## Build

```bash
cd tools/vault-plugin-tron-sign
go mod tidy
go build -o tron-sign-plugin .
```

SHA256 the binary, register it per [HashiCorp plugin docs](https://developer.hashicorp.com/vault/docs/plugins), then:

```bash
vault secrets enable -path=tron-sign -plugin-name=tron-sign-plugin plugin
```

## API (HTTP)

- `POST /v1/tron-sign/accounts/{trader_uuid}` body: `{ "private_key": "<64 hex>" }` — Wallet AppRole only in production.
- `GET  /v1/tron-sign/accounts/{trader_uuid}` — `{ "exists": true|false }` — optional; restrict to ops or deny for sweep.
- `POST /v1/tron-sign/accounts/{trader_uuid}/sign` body: `{ "digest_hex": "<64 hex lowercase>" }` → `{ "signature": "<130 hex>" }` — Sweep AppRole.

Set `VAULT_TRON_SECP_SIGN_MOUNT=tron-sign` in the API worker. When `TRON_SWEEP_REQUIRE_VAULT_SECP_ENGINE=true`, sweep refuses to start unless the mount is configured.

## Policies (sketch)

**wallet-service**

```hcl
path "tron-sign/accounts/*" {
  capabilities = ["create", "update"]
}
```

**sweep-service**

```hcl
path "tron-sign/accounts/*" {
  capabilities = ["read", "update"] # read = exists probe; update = /sign
}
path "tron-sign/accounts/*/sign" {
  capabilities = ["update"]
}
```

**Do not** grant sweep `read` on KV `secret/data/wallets/*` once all traders are registered in `tron-sign`; keep a one-time migration window if needed.

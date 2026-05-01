path "secret/data/wallet_counter" {
  capabilities = ["read", "create", "update"]
}
path "secret/data/master_seed" {
  capabilities = ["read"]
}
path "secret/data/wallets/*" {
  capabilities = ["create", "update"]
}

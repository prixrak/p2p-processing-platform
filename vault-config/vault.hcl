# Dev / single-host Docker: persists under volume vaultdata on the Compose host.
# API reaches Vault at http://vault:8200 inside the Compose network — do not expose 8200 publicly.
ui = true
disable_mlock = true

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

storage "file" {
  path = "/vault/data"
}

api_addr = "http://0.0.0.0:8200"

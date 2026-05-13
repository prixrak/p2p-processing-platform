import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';
import nodeVault from 'node-vault';

type VaultClient = ReturnType<typeof nodeVault>;

@Injectable()
export class HashicorpVaultService {
  private readonly logger = new Logger(HashicorpVaultService.name);
  private client: VaultClient | null = null;
  private walletToken: string | null = null;
  private sweepToken: string | null = null;

  /**
   * Wallet Service operations (counter, seed read, per-trader secret write).
   * Use `VAULT_WALLET_ROLE_ID` / `VAULT_WALLET_SECRET_ID`, or `VAULT_ROLE_ID` / `VAULT_SECRET_ID` as fallback.
   */
  isConfigured(): boolean {
    return Boolean(
      config.vault.addr?.trim() &&
        config.vault.walletRoleId?.trim() &&
        config.vault.walletSecretId?.trim(),
    );
  }

  /**
   * Sweep worker + energy delegator secret reads. Prefer dedicated `VAULT_SWEEP_*` AppRole (TZ §8 vs §6).
   */
  isSweepVaultConfigured(): boolean {
    return Boolean(
      config.vault.addr?.trim() &&
        config.vault.sweepRoleId?.trim() &&
        config.vault.sweepSecretId?.trim(),
    );
  }

  private baseVault(): VaultClient {
    const addr = config.vault.addr?.trim();
    if (!addr) {
      throw new Error('Vault is not configured (VAULT_ADDR)');
    }
    if (!this.client) {
      this.client = nodeVault({
        apiVersion: 'v1',
        endpoint: addr,
      });
    }
    return this.client;
  }

  private async loginAppRole(roleId: string, secretId: string): Promise<string> {
    const v = this.baseVault();
    const res = await v.approleLogin({
      role_id: roleId.trim(),
      secret_id: secretId.trim(),
    });
    const t = res?.auth?.client_token;
    if (typeof t !== 'string' || !t) {
      throw new Error('Vault AppRole login returned no client_token');
    }
    return t;
  }

  private async ensureWalletToken(): Promise<void> {
    if (this.walletToken) {
      this.baseVault().token = this.walletToken;
      return;
    }
    if (!this.isConfigured()) {
      throw new Error(
        'Vault wallet AppRole is not configured (VAULT_ADDR / VAULT_WALLET_ROLE_ID / VAULT_WALLET_SECRET_ID or fallback VAULT_ROLE_ID / VAULT_SECRET_ID)',
      );
    }
    try {
      this.walletToken = await this.loginAppRole(
        config.vault.walletRoleId,
        config.vault.walletSecretId,
      );
      this.baseVault().token = this.walletToken;
    } catch (e) {
      this.logger.warn(`Vault wallet AppRole login failed: ${e}`);
      throw e;
    }
  }

  private async ensureSweepToken(): Promise<void> {
    if (this.sweepToken) {
      this.baseVault().token = this.sweepToken;
      return;
    }
    if (!this.isSweepVaultConfigured()) {
      throw new Error(
        'Vault sweep AppRole is not configured (VAULT_ADDR / VAULT_SWEEP_ROLE_ID / VAULT_SWEEP_SECRET_ID or fallback VAULT_ROLE_ID / VAULT_SECRET_ID)',
      );
    }
    try {
      this.sweepToken = await this.loginAppRole(
        config.vault.sweepRoleId,
        config.vault.sweepSecretId,
      );
      this.baseVault().token = this.sweepToken;
    } catch (e) {
      this.logger.warn(`Vault sweep AppRole login failed: ${e}`);
      throw e;
    }
  }

  private vaultErrorStatusCode(e: unknown): number | undefined {
    return (e as { response?: { statusCode?: number } })?.response?.statusCode;
  }

  /**
   * AppRole leases expire (default often 1h). node-vault keeps one token in memory; without renewal,
   * Vault returns 403 / "permission denied". Refresh token once and retry the operation.
   */
  private async withWalletTokenRetry<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureWalletToken();
    try {
      return await fn();
    } catch (e: unknown) {
      if (this.vaultErrorStatusCode(e) !== 403) {
        throw e;
      }
      this.logger.warn(
        'Vault rejected the cached wallet token (403); refreshing AppRole login and retrying once',
      );
      this.walletToken = null;
      await this.ensureWalletToken();
      return await fn();
    }
  }

  private async withSweepTokenRetry<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureSweepToken();
    try {
      return await fn();
    } catch (e: unknown) {
      if (this.vaultErrorStatusCode(e) !== 403) {
        throw e;
      }
      this.logger.warn(
        'Vault rejected the cached sweep token (403); refreshing AppRole login and retrying once',
      );
      this.sweepToken = null;
      await this.ensureSweepToken();
      return await fn();
    }
  }

  /**
   * Returns BIP44 index to use for this allocation, then persists counter+1 in KV v2.
   */
  async consumeNextDerivationIndex(): Promise<number> {
    return this.withWalletTokenRetry(async () => {
      const path = `${config.vault.kvMount.trim()}/data/${config.vault.walletCounterPath.trim()}`;
      const v = this.baseVault();
      let current = 0;
      try {
        const res = await v.read(path);
        const raw = res?.data?.data?.current_index;
        if (raw !== undefined && raw !== null) {
          current = parseInt(String(raw), 10);
          if (!Number.isFinite(current) || current < 0) current = 0;
        }
      } catch (e: unknown) {
        const status = (e as { response?: { statusCode?: number } })?.response?.statusCode;
        if (status !== 404) {
          throw e;
        }
      }

      const assigned = current;
      await v.write(path, { data: { current_index: assigned + 1 } });
      return assigned;
    });
  }

  async readMasterSeed(): Promise<string> {
    return this.withWalletTokenRetry(async () => {
      const path = `${config.vault.kvMount.trim()}/data/${config.vault.masterSeedPath.trim()}`;
      const res = await this.baseVault().read(path);
      const seed = res?.data?.data?.seed;
      if (typeof seed !== 'string' || !seed.trim()) {
        throw new Error('Vault master seed missing or invalid');
      }
      return seed.trim();
    });
  }

  async writeTraderWalletSecrets(
    traderId: string,
    payload: { private_key: string; address: string; index: number },
  ): Promise<void> {
    return this.withWalletTokenRetry(async () => {
      const rel = `${config.vault.walletPrefixPath.trim()}/${traderId}`;
      const path = `${config.vault.kvMount.trim()}/data/${rel}`;
      await this.baseVault().write(path, {
        data: {
          private_key: payload.private_key,
          address: payload.address,
          index: payload.index,
        },
      });
    });
  }

  /** Used by sweep worker. Requires Vault policy with read on `secret/data/wallets/*`. */
  async readTraderWalletPrivateKeyHex(traderId: string): Promise<string> {
    return this.withSweepTokenRetry(async () => {
      const rel = `${config.vault.walletPrefixPath.trim()}/${traderId}`;
      const path = `${config.vault.kvMount.trim()}/data/${rel}`;
      const res = await this.baseVault().read(path);
      const pk = res?.data?.data?.private_key;
      if (typeof pk !== 'string' || !/^[0-9a-fA-F]{64}$/.test(pk)) {
        throw new Error('Vault wallet secret missing or invalid private key format');
      }
      return pk.toLowerCase();
    });
  }

  /**
   * TRON stake operator: hex private key at `{kvMount}/data/{subPath}` field `private_key`.
   * Used to delegate frozen ENERGY to custodial deposit addresses before sweep.
   */
  async readResourceDelegatorPrivateKeyHex(): Promise<string | null> {
    const sub = config.tron.resourceDelegatorVaultSubPath?.trim();
    if (!sub || !this.isSweepVaultConfigured()) {
      return null;
    }
    return this.withSweepTokenRetry(async () => {
      const path = `${config.vault.kvMount.trim()}/data/${sub}`;
      try {
        const res = await this.baseVault().read(path);
        const pk = res?.data?.data?.private_key;
        if (typeof pk !== 'string' || !/^[0-9a-fA-F]{64}$/.test(pk)) {
          return null;
        }
        return pk.toLowerCase();
      } catch (e: unknown) {
        const status = (e as { response?: { statusCode?: number } })?.response?.statusCode;
        if (status === 404) {
          return null;
        }
        throw e;
      }
    });
  }

  private normalizeTronPrivateKeyHex(pk: string): string {
    const s = pk.trim().toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(s)) {
      throw new Error('Invalid TRON ECDSA private key hex (expected 64 hex chars)');
    }
    return s;
  }

  async peekTronSecpSignerAccount(traderId: string): Promise<boolean> {
    const mount = config.vault.tronSecpSignMount.trim();
    if (!mount) {
      throw new Error('VAULT_TRON_SECP_SIGN_MOUNT is not set');
    }
    return this.withSweepTokenRetry(async () => {
      const v = this.baseVault();
      try {
        const res = await v.read(`${mount}/accounts/${traderId}`);
        return Boolean(res?.data?.exists);
      } catch (e: unknown) {
        const status = (e as { response?: { statusCode?: number } })?.response?.statusCode;
        if (status === 404) {
          return false;
        }
        throw e;
      }
    });
  }

  /**
   * Wallet AppRole — registers the trader key with the TZ-style Vault secrets engine (`vault-plugin-tron-sign`).
   */
  async upsertTronSecpSignerAccountWallet(traderId: string, privateKeyHex: string): Promise<void> {
    const mount = config.vault.tronSecpSignMount.trim();
    if (!mount) {
      return;
    }
    return this.withWalletTokenRetry(async () => {
      const pk = this.normalizeTronPrivateKeyHex(privateKeyHex);
      await this.baseVault().write(`${mount}/accounts/${traderId}`, { private_key: pk });
    });
  }

  /**
   * Sweep AppRole — same storage write for one-off migration when the wallet provision did not reach the plugin.
   */
  async upsertTronSecpSignerAccountSweep(traderId: string, privateKeyHex: string): Promise<void> {
    const mount = config.vault.tronSecpSignMount.trim();
    if (!mount) {
      throw new Error('VAULT_TRON_SECP_SIGN_MOUNT is not set');
    }
    return this.withSweepTokenRetry(async () => {
      const pk = this.normalizeTronPrivateKeyHex(privateKeyHex);
      await this.baseVault().write(`${mount}/accounts/${traderId}`, { private_key: pk });
    });
  }

  /** Sweep AppRole — signs SHA256(Transaction.raw_data) without exporting the key from Vault. */
  async signTronSweepDigestViaSecpEngine(traderId: string, digestHex32: string): Promise<string> {
    const mount = config.vault.tronSecpSignMount.trim();
    if (!mount) {
      throw new Error('VAULT_TRON_SECP_SIGN_MOUNT is not set');
    }
    const digest = digestHex32.trim().toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error('digest must be 32-byte hex');
    }
    return this.withSweepTokenRetry(async () => {
      const res = await this.baseVault().write(`${mount}/accounts/${traderId}/sign`, {
        digest_hex: digest,
      });
      const sig = res?.data?.signature;
      if (typeof sig !== 'string' || !/^[0-9a-f]{130}$/i.test(sig)) {
        throw new Error('Vault tron-sign engine returned no signature');
      }
      return sig.toLowerCase();
    });
  }
}

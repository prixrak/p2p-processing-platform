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
   * Use `VAULT_WALLET_ROLE_ID` / `VAULT_WALLET_SECRET_ID` or legacy `VAULT_ROLE_ID` / `VAULT_SECRET_ID`.
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
        'Vault wallet AppRole is not configured (VAULT_ADDR / VAULT_WALLET_ROLE_ID / VAULT_WALLET_SECRET_ID or legacy VAULT_ROLE_ID / VAULT_SECRET_ID)',
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
        'Vault sweep AppRole is not configured (VAULT_ADDR / VAULT_SWEEP_ROLE_ID / VAULT_SWEEP_SECRET_ID or legacy VAULT_ROLE_ID / VAULT_SECRET_ID)',
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

  /**
   * Returns BIP44 index to use for this allocation, then persists counter+1 in KV v2.
   */
  async consumeNextDerivationIndex(): Promise<number> {
    await this.ensureWalletToken();
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
  }

  async readMasterSeed(): Promise<string> {
    await this.ensureWalletToken();
    const path = `${config.vault.kvMount.trim()}/data/${config.vault.masterSeedPath.trim()}`;
    const res = await this.baseVault().read(path);
    const seed = res?.data?.data?.seed;
    if (typeof seed !== 'string' || !seed.trim()) {
      throw new Error('Vault master seed missing or invalid');
    }
    return seed.trim();
  }

  async writeTraderWalletSecrets(
    traderId: string,
    payload: { private_key: string; address: string; index: number },
  ): Promise<void> {
    await this.ensureWalletToken();
    const rel = `${config.vault.walletPrefixPath.trim()}/${traderId}`;
    const path = `${config.vault.kvMount.trim()}/data/${rel}`;
    await this.baseVault().write(path, {
      data: {
        private_key: payload.private_key,
        address: payload.address,
        index: payload.index,
      },
    });
  }

  /** Used by sweep worker. Requires Vault policy with read on `secret/data/wallets/*`. */
  async readTraderWalletPrivateKeyHex(traderId: string): Promise<string> {
    await this.ensureSweepToken();
    const rel = `${config.vault.walletPrefixPath.trim()}/${traderId}`;
    const path = `${config.vault.kvMount.trim()}/data/${rel}`;
    const res = await this.baseVault().read(path);
    const pk = res?.data?.data?.private_key;
    if (typeof pk !== 'string' || !/^[0-9a-fA-F]{64}$/.test(pk)) {
      throw new Error('Vault wallet secret missing or invalid private key format');
    }
    return pk.toLowerCase();
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
    await this.ensureSweepToken();
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
  }
}

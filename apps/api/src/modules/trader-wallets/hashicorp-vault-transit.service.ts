import { Injectable, Logger } from '@nestjs/common';
import { config } from '@p2p/config';
import nodeVault from 'node-vault';

type VaultClient = ReturnType<typeof nodeVault>;

/**
 * Optional HashiCorp Vault Transit integration for ECDSA signing.
 *
 * **TZ alignment:** Standard Vault OSS Transit remains unsuitable for mainnet TRON secp256k1 sweeps —
 * ship `tools/vault-plugin-tron-sign` (see {@link HashicorpVaultService.signTronSweepDigestViaSecpEngine}) instead.
 */
@Injectable()
export class HashicorpVaultTransitService {
  private readonly logger = new Logger(HashicorpVaultTransitService.name);
  private client: VaultClient | null = null;
  private token: string | null = null;

  isConfiguredForSigning(): boolean {
    return Boolean(
      config.vault.addr?.trim() &&
        config.vault.sweepRoleId?.trim() &&
        config.vault.sweepSecretId?.trim() &&
        config.vault.transitSigningKeyName?.trim(),
    );
  }

  private vault(): VaultClient {
    if (!config.vault.addr?.trim()) {
      throw new Error('VAULT_ADDR is not set');
    }
    if (!this.client) {
      this.client = nodeVault({
        apiVersion: 'v1',
        endpoint: config.vault.addr.trim(),
      });
    }
    if (this.token) {
      this.client.token = this.token;
    }
    return this.client;
  }

  private async ensureToken(): Promise<void> {
    if (!config.vault.sweepRoleId?.trim() || !config.vault.sweepSecretId?.trim()) {
      throw new Error('Vault sweep AppRole is not configured');
    }
    if (this.token) {
      this.vault().token = this.token;
      return;
    }
    const v = this.vault();
    const res = await v.approleLogin({
      role_id: config.vault.sweepRoleId.trim(),
      secret_id: config.vault.sweepSecretId.trim(),
    });
    const t = res?.auth?.client_token;
    if (typeof t !== 'string' || !t) {
      throw new Error('Vault AppRole login returned no client_token');
    }
    this.token = t;
    v.token = t;
  }

  private vaultErrorStatusCode(e: unknown): number | undefined {
    return (e as { response?: { statusCode?: number } })?.response?.statusCode;
  }

  /**
   * Calls `transit/sign/{key}`. Returns null if signing is not configured.
   * **Do not use for Tron mainnet** unless the key material is secp256k1-compatible (non-standard Vault).
   */
  async signPrehashedSha256Base64(prehashedBase64: string): Promise<string | null> {
    if (!this.isConfiguredForSigning()) {
      return null;
    }
    const key = config.vault.transitSigningKeyName!.trim();

    const attempt = async (): Promise<string | null> => {
      await this.ensureToken();
      const res = await this.vault().write(`transit/sign/${key}`, {
        input: prehashedBase64,
        hash_algorithm: 'sha2-256',
        signature_algorithm: 'pkcs1v15',
      });
      const sig = res?.data?.signature;
      if (typeof sig !== 'string') {
        this.logger.warn('Vault Transit returned no signature');
        return null;
      }
      return sig;
    };

    try {
      return await attempt();
    } catch (e: unknown) {
      if (this.vaultErrorStatusCode(e) === 403) {
        this.logger.warn(
          'Vault Transit rejected cached sweep token (403); refreshing AppRole login and retrying once',
        );
        this.token = null;
        try {
          return await attempt();
        } catch (e2: unknown) {
          this.logger.warn(`Vault Transit sign failed after retry: ${e2}`);
          return null;
        }
      }
      this.logger.warn(`Vault Transit sign failed (expected for non-P256 Tron keys): ${e}`);
      return null;
    }
  }
}

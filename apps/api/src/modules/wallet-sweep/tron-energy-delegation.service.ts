import { Injectable, Logger } from '@nestjs/common';
import { TronWeb } from 'tronweb';
import { config } from '@p2p/config';
import { HashicorpVaultService } from '../trader-wallets/hashicorp-vault.service';

/**
 * TRON Stake 2.0: delegate frozen ENERGY from an operator account to a trader deposit address
 * before broadcasting TRC-20 USDT sweep (TZ §3.4). The operator must already hold sufficient
 * frozen TRX for ENERGY; this service only moves delegation to the target address.
 */
@Injectable()
export class TronEnergyDelegationService {
  private readonly logger = new Logger(TronEnergyDelegationService.name);
  private delegator: { tw: any; ownerBase58: string } | null = null;

  constructor(private readonly vault: HashicorpVaultService) {}

  private async getDelegator(): Promise<{ tw: any; ownerBase58: string } | null> {
    if (!config.tron.resourceDelegationEnabled) {
      return null;
    }
    if (this.delegator) {
      return this.delegator;
    }

    let pk = config.tron.resourceDelegatorPrivateKey?.trim() ?? '';
    if (!pk && this.vault.isSweepVaultConfigured()) {
      pk = (await this.vault.readResourceDelegatorPrivateKeyHex()) ?? '';
    }
    if (!pk || !/^[0-9a-fA-F]{64}$/.test(pk)) {
      this.logger.warn('TRON_RESOURCE_DELEGATION_ENABLED but delegator private key is missing');
      return null;
    }

    const tw = createDelegatorTw();
    tw.setPrivateKey(pk.toLowerCase());
    const ownerBase58: string | undefined = tw.defaultAddress?.base58;
    if (!ownerBase58) {
      this.logger.warn('Could not read delegator default Tron address');
      return null;
    }

    this.delegator = { tw, ownerBase58 };
    return this.delegator;
  }

  /** Delegates ENERGY (stake SUN) to `receiverBase58`. Returns false if skipped or failed. */
  async delegateEnergyToTraderAddress(receiverBase58: string): Promise<boolean> {
    const d = await this.getDelegator();
    if (!d) return false;

    const amount = Math.max(1, config.tron.delegateEnergyTrxSun);
    try {
      const tx = await d.tw.transactionBuilder.delegateResource(
        amount,
        receiverBase58,
        'ENERGY',
        d.ownerBase58,
        false,
      );
      const signed = await d.tw.trx.sign(tx);
      const out = await d.tw.trx.sendRawTransaction(signed);
      if (!out?.result) {
        this.logger.warn(`delegateResource failed: ${JSON.stringify(out)}`);
        return false;
      }
      this.logger.log(
        `Delegated ENERGY (${amount} SUN stake) from operator to ${receiverBase58.slice(0, 10)}…`,
      );
      return true;
    } catch (e) {
      this.logger.warn(`delegateResource error: ${e}`);
      return false;
    }
  }

  /** Revokes delegation of the configured ENERGY amount from `receiverBase58`. */
  async undelegateEnergyFromTraderAddress(receiverBase58: string): Promise<boolean> {
    const d = await this.getDelegator();
    if (!d) return false;

    const amount = Math.max(1, config.tron.delegateEnergyTrxSun);
    try {
      const tx = await d.tw.transactionBuilder.undelegateResource(
        amount,
        receiverBase58,
        'ENERGY',
        d.ownerBase58,
      );
      const signed = await d.tw.trx.sign(tx);
      const out = await d.tw.trx.sendRawTransaction(signed);
      if (!out?.result) {
        this.logger.warn(`undelegateResource failed: ${JSON.stringify(out)}`);
        return false;
      }
      this.logger.log(`Undelegated ENERGY from ${receiverBase58.slice(0, 10)}…`);
      return true;
    } catch (e) {
      this.logger.warn(`undelegateResource error: ${e}`);
      return false;
    }
  }
}

function createDelegatorTw(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new TronWeb({
    fullHost: config.tron.baseUrl,
    headers: config.tron.apiKey ? { 'TRON-PRO-API-KEY': config.tron.apiKey } : {},
  });
}

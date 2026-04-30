import * as bip39 from 'bip39';
import HDKey from 'hdkey';
import bs58check from 'bs58check';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';

/** SLIP-0044 coin type for TRON. */
const TRON_COIN_TYPE = 195;

function privateKeyHexToTronAddress(privHex: string): string {
  const sk = Uint8Array.from(Buffer.from(privHex, 'hex'));
  const pub = secp256k1.getPublicKey(sk, false);
  const pub64 = pub.subarray(1);
  const hash = keccak256(pub64);
  const last20 = hash.subarray(-20);
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(last20, 1);
  return bs58check.encode(Buffer.from(payload));
}

/**
 * Derive Tron main-address (base58) from BIP39 mnemonic at path m/44'/195'/0'/0/{index}.
 */
export function deriveTronAddressFromMnemonic(mnemonic: string, index: number): { address: string; privateKeyHex: string } {
  if (!bip39.validateMnemonic(mnemonic.trim())) {
    throw new Error('Invalid BIP39 mnemonic from Vault');
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Derivation index must be a non-negative integer');
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
  const root = HDKey.fromMasterSeed(seed);
  const path = `m/44'/${TRON_COIN_TYPE}'/0'/0/${index}`;
  const child = root.derive(path);

  if (!child.privateKey) {
    throw new Error('BIP44 derivation produced no private key');
  }

  const privateKeyHex = child.privateKey.toString('hex');
  const address = privateKeyHexToTronAddress(privateKeyHex);
  return { address, privateKeyHex };
}

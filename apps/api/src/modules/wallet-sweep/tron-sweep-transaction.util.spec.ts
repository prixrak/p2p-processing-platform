import { deriveTronAddressFromMnemonic } from '../trader-wallets/tron-bip44.util';
import { digestOfTronRawDataHex, encodeTronTrc20TransferParameter } from './tron-sweep-transaction.util';

describe('tron-sweep-transaction.util', () => {
  const mnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('ABI-encodes transfer(address,uint256) args without the function selector prefix', () => {
    const addr = deriveTronAddressFromMnemonic(mnemonic, 2).address;
    const hex = encodeTronTrc20TransferParameter(addr, 1_000_000);
    expect(hex).toHaveLength(128);
    expect(/^([0-9a-f]{2})+$/.test(hex)).toBe(true);
  });

  it('hashes raw_data_hex with SHA256(digest)', () => {
    const hex = '0a02780a088000000518000041e21080b870c0';
    const d = digestOfTronRawDataHex(hex);
    expect(d).toHaveLength(32);
  });
});

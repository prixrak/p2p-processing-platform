import { deriveTronAddressFromMnemonic } from './tron-bip44.util';

describe('deriveTronAddressFromMnemonic', () => {
  it('produces stable Tron addresses for a fixed mnemonic and index', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const a = deriveTronAddressFromMnemonic(mnemonic, 0);
    const b = deriveTronAddressFromMnemonic(mnemonic, 0);
    expect(a.address).toBe(b.address);
    expect(a.privateKeyHex).toBe(b.privateKeyHex);
    expect(a.address.startsWith('T')).toBe(true);
    expect(a.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes address when derivation index changes', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const u0 = deriveTronAddressFromMnemonic(mnemonic, 0);
    const u1 = deriveTronAddressFromMnemonic(mnemonic, 1);
    expect(u0.address).not.toBe(u1.address);
  });
});

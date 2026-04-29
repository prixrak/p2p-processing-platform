import { decodeUint256Data, padTopicAddress } from './ethereum-json-rpc.client';

describe('ethereum-json-rpc helpers', () => {
  it('padTopicAddress pads a checksummed address to a 32-byte topic', () => {
    const t = padTopicAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(t).toBe(
      '0x000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7',
    );
  });

  it('decodeUint256Data parses Transfer value', () => {
    expect(decodeUint256Data('0x01')).toBe(1n);
    expect(decodeUint256Data('0xf4240')).toBe(1_000_000n);
  });
});

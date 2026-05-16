import { TrongridClient, trongridSupportsV1AccountTokens } from './trongrid.client';

describe('trongridSupportsV1AccountTokens', () => {
  it('is false for public Nile TronGrid (tokens index not available)', () => {
    expect(trongridSupportsV1AccountTokens('https://nile.trongrid.io')).toBe(false);
    expect(trongridSupportsV1AccountTokens('https://nile.trongrid.io/')).toBe(false);
  });

  it('is true for mainnet TronGrid', () => {
    expect(trongridSupportsV1AccountTokens('https://api.trongrid.io')).toBe(true);
  });
});

describe('TrongridClient', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('listRecentUsdtTrc20 does not call TronGrid for empty or whitespace address', async () => {
    const client = new TrongridClient();
    await expect(client.listRecentUsdtTrc20('')).resolves.toEqual([]);
    await expect(client.listRecentUsdtTrc20('   ')).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getAccountTrxBalance returns null without HTTP for blank address', async () => {
    const client = new TrongridClient();
    await expect(client.getAccountTrxBalance('')).resolves.toBeNull();
    await expect(client.getAccountTrxBalance('\t')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getAccountUsdtTrc20Balance returns null without HTTP for blank address', async () => {
    const client = new TrongridClient();
    await expect(client.getAccountUsdtTrc20Balance('')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

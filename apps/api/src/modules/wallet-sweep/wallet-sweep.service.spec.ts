import { WalletSweepService } from './wallet-sweep.service';

describe('WalletSweepService.maybeSweep', () => {
  const cold = 'TCdqDmeVe2VWagmCdX6Zb4CrP6eaxDSZmc';
  const fromAddress = 'TXTxeuRwCdvCnBc61YUqveaXS5JD8AdR96';

  function buildService(overrides: {
    reconcile?: { credited: number; pending: number };
    hasUncredited?: boolean;
    balance?: number;
  }) {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const walletDeposits = {
      reconcileTrc20IncomingForAddress: jest
        .fn()
        .mockResolvedValue(overrides.reconcile ?? { credited: 0, pending: 0 }),
      hasUncreditedTrc20Deposits: jest.fn().mockResolvedValue(overrides.hasUncredited ?? false),
    };
    const trongrid = {
      getAccountUsdtTrc20Balance: jest.fn().mockResolvedValue(overrides.balance ?? 25),
      getAccountTrxBalance: jest.fn().mockResolvedValue(10),
    };
    const service = new WalletSweepService(
      { walletSweepLog: { create: jest.fn(), update: jest.fn() } } as never,
      trongrid as never,
      { isSweepVaultConfigured: () => true } as never,
      { delegateEnergyToTraderAddress: jest.fn().mockResolvedValue(false) } as never,
      walletDeposits as never,
    );
    (service as unknown as { redis: typeof redis }).redis = redis;
    return { service, walletDeposits, trongrid, redis };
  }

  beforeEach(() => {
    process.env.TRON_SWEEP_COLD_WALLET_ADDRESS = cold;
    process.env.TRON_SWEEP_THRESHOLD_USDT = '1';
    process.env.TRON_SWEEP_TRX_RESERVE = '0.5';
  });

  it('defers sweep when reconcile reports deposits awaiting confirmations', async () => {
    const { service, walletDeposits, trongrid } = buildService({
      reconcile: { credited: 0, pending: 1 },
    });

    await service.maybeSweep('trader-1', fromAddress);

    expect(walletDeposits.reconcileTrc20IncomingForAddress).toHaveBeenCalledWith(
      'trader-1',
      fromAddress,
    );
    expect(trongrid.getAccountUsdtTrc20Balance).not.toHaveBeenCalled();
  });

  it('defers sweep when uncredited wallet_deposit rows remain', async () => {
    const { service, trongrid } = buildService({
      reconcile: { credited: 0, pending: 0 },
      hasUncredited: true,
    });

    await service.maybeSweep('trader-1', fromAddress);

    expect(trongrid.getAccountUsdtTrc20Balance).not.toHaveBeenCalled();
  });
});

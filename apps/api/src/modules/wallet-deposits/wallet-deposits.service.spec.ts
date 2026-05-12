import { BlockchainNetwork, SettlementTypeEnum } from '@prisma/client';
import { WalletDepositsService } from './wallet-deposits.service';

describe('WalletDepositsService.creditDepositAtomic', () => {
  function buildTxMock() {
    return {
      walletDeposit: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      traderBalance: { upsert: jest.fn().mockResolvedValue({}) },
      settlement: { create: jest.fn().mockResolvedValue({ id: 'set-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it('creates a settlement linked to the wallet deposit', async () => {
    const tx = buildTxMock();
    (tx.walletDeposit.findUnique as jest.Mock).mockResolvedValue(null);
    (tx.walletDeposit.create as jest.Mock).mockResolvedValue({ id: 'dep-1' });

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<{ id: string }>) => fn(tx)),
    };
    const balanceTxService = { record: jest.fn().mockResolvedValue({ id: 'bt-1' }) };
    const depositEvents = { publishAfterTrc20Credit: jest.fn() };
    const trongrid = {};
    const currencies = { getUsdtCurrencyId: jest.fn().mockResolvedValue('curr-usdt') };

    const service = new WalletDepositsService(
      prisma as never,
      balanceTxService as never,
      depositEvents as never,
      trongrid as never,
      currencies as never,
    );

    await service.creditDepositAtomic({
      traderId: 'trader-1',
      txHash: '0xabc',
      network: BlockchainNetwork.ERC20,
      amountUsdt: 50,
      confirmations: 12,
      actorId: null,
    });

    expect(balanceTxService.record).toHaveBeenCalled();
    expect(tx.settlement.create).toHaveBeenCalledWith({
      data: {
        adminId: null,
        traderId: 'trader-1',
        type: SettlementTypeEnum.CREDIT,
        amount: 50,
        currencyId: 'curr-usdt',
        note: 'On-chain deposit 0xabc (ERC20)',
        walletDepositId: 'dep-1',
      },
    });
    expect(depositEvents.publishAfterTrc20Credit).not.toHaveBeenCalled();
  });

  it('does not create a settlement when deposit was already credited', async () => {
    const tx = buildTxMock();
    (tx.walletDeposit.findUnique as jest.Mock).mockResolvedValue({
      id: 'dep-existing',
      status: 'CREDITED',
      traderId: 'trader-1',
      amountUsdt: 50,
    });

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const balanceTxService = { record: jest.fn() };
    const depositEvents = { publishAfterTrc20Credit: jest.fn() };
    const trongrid = {};
    const currencies = { getUsdtCurrencyId: jest.fn().mockResolvedValue('curr-usdt') };

    const service = new WalletDepositsService(
      prisma as never,
      balanceTxService as never,
      depositEvents as never,
      trongrid as never,
      currencies as never,
    );

    await service.creditDepositAtomic({
      traderId: 'trader-1',
      txHash: '0xabc',
      network: BlockchainNetwork.ERC20,
      amountUsdt: 50,
      confirmations: 12,
      actorId: null,
    });

    expect(tx.settlement.create).not.toHaveBeenCalled();
    expect(balanceTxService.record).not.toHaveBeenCalled();
  });

  it('sets adminId on settlement when an operator confirms the deposit', async () => {
    const tx = buildTxMock();
    (tx.walletDeposit.findUnique as jest.Mock).mockResolvedValue(null);
    (tx.walletDeposit.create as jest.Mock).mockResolvedValue({ id: 'dep-2' });

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<{ id: string }>) => fn(tx)),
    };
    const balanceTxService = { record: jest.fn().mockResolvedValue({ id: 'bt-2' }) };
    const depositEvents = { publishAfterTrc20Credit: jest.fn() };
    const trongrid = {};
    const currencies = { getUsdtCurrencyId: jest.fn().mockResolvedValue('curr-usdt') };

    const service = new WalletDepositsService(
      prisma as never,
      balanceTxService as never,
      depositEvents as never,
      trongrid as never,
      currencies as never,
    );

    await service.creditDepositAtomic({
      traderId: 'trader-1',
      txHash: '0xdef',
      network: BlockchainNetwork.TRC20,
      amountUsdt: 10,
      confirmations: 20,
      actorId: 'admin-user-1',
    });

    expect(tx.settlement.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-user-1',
        traderId: 'trader-1',
        type: SettlementTypeEnum.CREDIT,
        amount: 10,
        currencyId: 'curr-usdt',
        note: 'On-chain deposit 0xdef (TRC20)',
        walletDepositId: 'dep-2',
      },
    });
  });
});

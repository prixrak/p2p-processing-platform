import { BlockchainNetwork } from '@prisma/client';
import { WalletDepositsService } from './wallet-deposits.service';

describe('WalletDepositsService.reconcileTrc20IncomingForAddress', () => {
  it('credits incoming transfers to the normalized deposit address', async () => {
    const depositAddr = 'TXTxeuRwCdvCnBc61YUqveaXS5JD8AdR96';
    const trongrid = {
      getNowBlockNumber: jest.fn().mockResolvedValue(100),
      listRecentUsdtTrc20: jest.fn().mockResolvedValue([
        {
          transaction_id: 'tx-in-25',
          from: 'TSender1111111111111111111111111111',
          to: depositAddr,
          value: '25000000',
        },
        {
          transaction_id: 'tx-out-sweep',
          from: depositAddr,
          to: 'TCold11111111111111111111111111111',
          value: '25000000',
        },
      ]),
      getTxBlockNumber: jest.fn().mockResolvedValue(90),
    };
    const observeAndMaybeCredit = jest
      .fn()
      .mockResolvedValueOnce({ status: 'credited', depositId: 'dep-1' })
      .mockResolvedValue({ status: 'skipped' });

    const service = new WalletDepositsService(
      {} as never,
      {} as never,
      {} as never,
      trongrid as never,
      {} as never,
    );
    service.observeAndMaybeCredit = observeAndMaybeCredit;

    const result = await service.reconcileTrc20IncomingForAddress('trader-1', depositAddr);

    expect(result.credited).toBe(1);
    expect(observeAndMaybeCredit).toHaveBeenCalledTimes(1);
    expect(observeAndMaybeCredit).toHaveBeenCalledWith(
      'trader-1',
      'tx-in-25',
      25,
      11,
      expect.any(Number),
      null,
      BlockchainNetwork.TRC20,
      expect.objectContaining({ toAddress: depositAddr, blockNumber: 90 }),
    );
  });

  it('hasUncreditedTrc20Deposits is true when PENDING or CONFIRMED rows exist', async () => {
    const prisma = {
      walletDeposit: {
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const service = new WalletDepositsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const blocked = await service.hasUncreditedTrc20Deposits(
      'trader-1',
      'TXTxeuRwCdvCnBc61YUqveaXS5JD8AdR96',
    );

    expect(blocked).toBe(true);
    expect(prisma.walletDeposit.count).toHaveBeenCalled();
  });
});

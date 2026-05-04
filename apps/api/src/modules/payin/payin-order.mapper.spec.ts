import { AppealStatus, PayInOrderStatus } from '@p2p/shared';
import type { OrderWithRelations } from './payin-order.mapper';
import { payinOrderToOrderDto } from './payin-order.mapper';

describe('payinOrderToOrderDto', () => {
  const baseDate = new Date('2026-01-15T12:00:00.000Z');

  function minimalOrder(
    overrides: Partial<OrderWithRelations> = {},
  ): OrderWithRelations {
    return {
      id: 'order-1',
      requestId: 'req-1',
      createdAt: baseDate,
      confirmedAt: null,
      completedAt: null,
      updatedAt: baseDate,
      autocloseAt: baseDate,
      currency: 'UAH',
      amount: 100 as any,
      commission: 5 as any,
      partnerAmount: 95 as any,
      rate: 41 as any,
      status: PayInOrderStatus.NEW,
      redirectUrl: null,
      requisite: {
        id: 'req-num',
        type: 'CARD',
        number: '4111',
        owner: 'John Doe',
        code: null,
        bank: { name: 'Test Bank' },
      },
      appeals: [],
      forkChatProofs: [],
      ...overrides,
    } as OrderWithRelations;
  }

  it('maps core fields and payment_detail', () => {
    const dto = payinOrderToOrderDto(minimalOrder());
    expect(dto.id).toBe('order-1');
    expect(dto.request_id).toBe('req-1');
    expect(dto.status).toBe(PayInOrderStatus.NEW);
    expect(dto.amount).toBe(100);
    expect(dto.payment_detail).toEqual({
      id: 'req-num',
      type: 'CARD',
      number: '4111',
      owner: 'John Doe',
      code: '',
      bank_name: 'Test Bank',
    });
  });

  it('maps appeals with proofs', () => {
    const order = minimalOrder({
      appeals: [
        {
          id: 'ap-1',
          status: AppealStatus.OPEN,
          createdAt: baseDate,
          paidAmount: 100 as any,
          proofs: [{ fileId: 'f1' }, { fileId: 'f2' }],
        } as any,
      ],
    });
    const dto = payinOrderToOrderDto(order);
    expect(dto.appeals).toHaveLength(1);
    expect(dto.appeals[0].proofs_of_payment).toEqual(['f1', 'f2']);
    expect(dto.appeals[0].payin_order_id).toBe('order-1');
  });

  it('returns null payment_detail when requisite is missing', () => {
    const dto = payinOrderToOrderDto(minimalOrder({ requisite: null as any }));
    expect(dto.payment_detail).toBeNull();
    expect(dto.requisite_number).toBe('');
  });

  it('maps completed_at from completedAt when present', () => {
    const done = new Date('2026-01-15T14:30:00.000Z');
    const dto = payinOrderToOrderDto(
      minimalOrder({
        status: PayInOrderStatus.PAID,
        completedAt: done,
      }),
    );
    expect(dto.completed_at).toBe(Math.floor(done.getTime() / 1000));
  });

  it('falls back completed_at to updatedAt for legacy history rows without completedAt', () => {
    const upd = new Date('2026-01-15T15:00:00.000Z');
    const dto = payinOrderToOrderDto(
      minimalOrder({
        status: PayInOrderStatus.CANCELED,
        completedAt: null,
        updatedAt: upd,
      }),
    );
    expect(dto.completed_at).toBe(Math.floor(upd.getTime() / 1000));
  });

  it('maps fork verification and trader processing snapshot', () => {
    const dto = payinOrderToOrderDto(
      minimalOrder({
        traderProcessingMethod: 'FORK' as never,
        forkExchangeReference: 'exchange-ref-1',
        forkChatProofs: [{ fileId: 'chat-file-1' } as never],
      }),
    );
    expect(dto.trader_processing_method).toBe('FORK');
    expect(dto.fork_exchange_reference).toBe('exchange-ref-1');
    expect(dto.fork_chat_proof_file_ids).toEqual(['chat-file-1']);
  });

  it('sets completed_at null for in-progress statuses without completedAt', () => {
    const dto = payinOrderToOrderDto(
      minimalOrder({ status: PayInOrderStatus.NEW, completedAt: null }),
    );
    expect(dto.completed_at).toBeNull();
  });
});

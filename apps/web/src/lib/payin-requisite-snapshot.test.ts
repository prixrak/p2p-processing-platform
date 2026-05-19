import { describe, expect, it } from 'vitest';
import type { OrderDto } from '@p2p/shared';
import { PayInOrderStatus } from '@p2p/shared';
import { payinOrderRequisiteSnapshot } from './payin-requisite-snapshot';

function baseOrder(over: Partial<OrderDto>): OrderDto {
  return {
    id: 'o1',
    request_id: 'r1',
    created_at: 0,
    confirmed_at: null,
    completed_at: null,
    autoclose_at: null,
    currency: 'UAH',
    amount: 1,
    amount_equivalent_usdt: null,
    commission: 0,
    partner_amount: 0,
    commission_percent: 0,
    payin_trader_markup_percent: null,
    rate: 0,
    status: PayInOrderStatus.NEW,
    requisite_number: '',
    requisite_owner: '',
    requisite_card_holder_name: '',
    bank: '',
    redirect_url: null,
    appeals: [],
    payment_detail: null,
    ...over,
  };
}

describe('payinOrderRequisiteSnapshot', () => {
  it('uses payment_detail and extracts last four digits', () => {
    const row = baseOrder({
      payment_detail: {
        id: 'p1',
        type: 'CARD',
        number: '4441 1110 0210 8417',
        owner: 'Jane Doe',
        card_holder_name: 'Doe Jane Ivanovna',
        code: '',
        bank_name: 'Monobank',
      },
    });
    const s = payinOrderRequisiteSnapshot(row);
    expect(s.hasRequisite).toBe(true);
    expect(s.copyValue).toBe('4441111002108417');
    expect(s.lastFourDisplay).toBe('8417');
    expect(s.owner).toBe('Jane Doe');
    expect(s.cardHolderName).toBe('Doe Jane Ivanovna');
    expect(s.bank).toBe('Monobank');
    expect(s.type).toBe('CARD');
  });

  it('falls back to order-level requisite fields when payment_detail is null', () => {
    const row = baseOrder({
      requisite_number: 'UA12345678901234567890',
      requisite_owner: 'ACME',
      requisite_card_holder_name: 'Smith John',
      bank: 'Privat',
      trader_processing_method: 'CARD',
      payment_detail: null,
    });
    const s = payinOrderRequisiteSnapshot(row);
    expect(s.copyValue).toBe('UA12345678901234567890');
    expect(s.lastFourDisplay).toBe('7890');
    expect(s.owner).toBe('ACME');
    expect(s.cardHolderName).toBe('Smith John');
    expect(s.bank).toBe('Privat');
    expect(s.type).toBe('CARD');
  });

  it('returns empty snapshot when no number', () => {
    const s = payinOrderRequisiteSnapshot(baseOrder({}));
    expect(s.hasRequisite).toBe(false);
    expect(s.lastFourDisplay).toBeNull();
  });
});

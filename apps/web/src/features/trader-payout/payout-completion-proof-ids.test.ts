import { describe, expect, it } from 'vitest';
import type { PayOutOrderApiDto } from '@p2p/shared';
import { DetailsType, PayOutOrderStatus } from '@p2p/shared';
import { payoutCompletionProofFileIds } from './payout-completion-proof-ids';

const base: PayOutOrderApiDto = {
  id: '00000000-0000-0000-0000-000000000001',
  request_id: 'req-1',
  created_at: 0,
  start_at: null,
  end_at: null,
  currency: 'UAH',
  details: { type: DetailsType.CARD, number: '4111' },
  amount: 100,
  status: PayOutOrderStatus.COMPLETED,
  rate: 1,
  partner_amount: 100,
  percent_fee: 0,
};

describe('payoutCompletionProofFileIds', () => {
  it('prefers completion_proof_file_ids when present', () => {
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    expect(
      payoutCompletionProofFileIds({
        ...base,
        completion_proof_file_id: '33333333-3333-3333-3333-333333333333',
        completion_proof_file_ids: [a, b],
      }),
    ).toEqual([a, b]);
  });

  it('falls back to legacy single id', () => {
    const id = '44444444-4444-4444-4444-444444444444';
    expect(payoutCompletionProofFileIds({ ...base, completion_proof_file_id: id })).toEqual([id]);
  });

  it('returns empty array when no proofs', () => {
    expect(payoutCompletionProofFileIds(base)).toEqual([]);
  });
});

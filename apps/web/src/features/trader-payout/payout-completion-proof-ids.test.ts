import { describe, expect, it } from 'vitest';
import type { PayOutOrderCabinetDto } from '@p2p/shared';
import { PayOutOrderStatus } from '@p2p/shared';
import {
  mergeCompletionProofUploadIdsForComplete,
  payoutCompletionProofFileIds,
} from './payout-completion-proof-ids';

const base: PayOutOrderCabinetDto = {
  id: '00000000-0000-0000-0000-000000000001',
  created_at: 0,
  start_at: null,
  currency: 'UAH',
  details: { number: '4111' },
  amount: 100,
  status: PayOutOrderStatus.COMPLETED,
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

  it('falls back to single-column completion_proof_file_id', () => {
    const id = '44444444-4444-4444-4444-444444444444';
    expect(payoutCompletionProofFileIds({ ...base, completion_proof_file_id: id })).toEqual([id]);
  });

  it('returns empty array when no proofs', () => {
    expect(payoutCompletionProofFileIds(base)).toEqual([]);
  });
});

describe('mergeCompletionProofUploadIdsForComplete', () => {
  it('appends staged then new uploads, skips duplicates', () => {
    const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const c = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    expect(mergeCompletionProofUploadIdsForComplete([a], [b, a, c], 10)).toEqual([a, b, c]);
  });

  it('caps merged list', () => {
    const ids = Array.from({ length: 10 }, (_, i) =>
      `aaaaaaaa-aaaa-aaaa-aaaa-${i.toString().padStart(12, '0')}`,
    );
    expect(
      mergeCompletionProofUploadIdsForComplete(
        ids.slice(0, 3),
        ids.slice(3, 7),
        5,
      ),
    ).toHaveLength(5);
  });
});

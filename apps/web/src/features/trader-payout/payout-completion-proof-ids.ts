import type { PayOutOrderApiDto } from '@p2p/shared';

/** Resolves all completion proof file ids (multi-file API + legacy single field). */
export function payoutCompletionProofFileIds(order: PayOutOrderApiDto): string[] {
  if (order.completion_proof_file_ids && order.completion_proof_file_ids.length > 0) {
    return order.completion_proof_file_ids;
  }
  if (order.completion_proof_file_id) {
    return [order.completion_proof_file_id];
  }
  return [];
}

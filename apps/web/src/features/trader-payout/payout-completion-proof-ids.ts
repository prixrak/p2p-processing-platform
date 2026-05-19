import type { PayOutOrderCabinetDto } from '@p2p/shared';

/** Resolves completion proof file ids (multi-file list, else single `completion_proof_file_id`). */
export function payoutCompletionProofFileIds(order: PayOutOrderCabinetDto): string[] {
  if (order.completion_proof_file_ids && order.completion_proof_file_ids.length > 0) {
    return order.completion_proof_file_ids;
  }
  if (order.completion_proof_file_id) {
    return [order.completion_proof_file_id];
  }
  return [];
}

/**
 * Staged uploads (already on `/api/files/upload`) plus uploads from the complete dialog,
 * preserving order within each group, skipping duplicates, and capping before `traderComplete`.
 */
export function mergeCompletionProofUploadIdsForComplete(
  stagedIds: readonly string[],
  newlyUploadedIds: readonly string[],
  maxFiles: number,
): string[] {
  const merged = [...stagedIds, ...newlyUploadedIds];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of merged) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (out.length >= maxFiles) break;
    out.push(id);
  }
  return out;
}

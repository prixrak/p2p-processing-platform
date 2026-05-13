import { IsOptional, IsUUID, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_PAYOUT_COMPLETION_PROOF_FILES } from '@p2p/shared';

export class AttachCompletionProofDto {
  @ApiPropertyOptional({
    description: 'Single proof file id (upload via POST /api/files/upload by this user). Appended to existing proofs.',
  })
  @IsOptional()
  @IsUUID()
  completion_proof_file_id?: string;

  @ApiPropertyOptional({
    description:
      'One or more proof file ids to append (same upload route). Respects per-order max; duplicates are ignored.',
    type: [String],
    maxItems: MAX_PAYOUT_COMPLETION_PROOF_FILES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PAYOUT_COMPLETION_PROOF_FILES)
  @IsUUID('4', { each: true })
  completion_proof_file_ids?: string[];
}

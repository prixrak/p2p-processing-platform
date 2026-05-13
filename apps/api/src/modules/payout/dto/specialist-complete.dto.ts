import { IsOptional, IsUUID, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_PAYOUT_COMPLETION_PROOF_FILES } from '@p2p/shared';

export class SpecialistCompleteDto {
  @ApiPropertyOptional({
    description: 'Optional proof file id (upload via POST /api/files/upload first).',
  })
  @IsOptional()
  @IsUUID()
  completion_proof_file_id?: string;

  @ApiPropertyOptional({
    description:
      'Optional proof file ids when attaching multiple receipts (same upload route). Max follows platform batch limit.',
    type: [String],
    maxItems: MAX_PAYOUT_COMPLETION_PROOF_FILES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PAYOUT_COMPLETION_PROOF_FILES)
  @IsUUID('4', { each: true })
  completion_proof_file_ids?: string[];
}

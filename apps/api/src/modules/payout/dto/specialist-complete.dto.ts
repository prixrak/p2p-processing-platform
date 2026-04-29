import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SpecialistCompleteDto {
  @ApiPropertyOptional({
    description: 'Optional proof file id (upload via POST /api/files/upload first).',
  })
  @IsOptional()
  @IsUUID()
  completion_proof_file_id?: string;
}

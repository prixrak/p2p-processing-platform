import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AttachCompletionProofDto {
  @ApiProperty({
    description: 'Proof file id (upload via POST /api/files/upload by this user).',
  })
  @IsUUID()
  completion_proof_file_id!: string;
}

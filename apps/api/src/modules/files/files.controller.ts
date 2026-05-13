import {
  Controller,
  Delete,
  Post,
  Get,
  HttpCode,
  Param,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { FilesService, FileDownloadActor } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_MULTIPART_FILES_PER_REQUEST,
  UserRole,
} from '@p2p/shared';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Roles(UserRole.TRADER, UserRole.PAYOUT_TRADER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT, UserRole.MERCHANT)
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.filesService.upload(file, userId);
  }

  @Post('upload/batch')
  @Roles(UserRole.TRADER, UserRole.PAYOUT_TRADER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT, UserRole.MERCHANT)
  @ApiOperation({ summary: 'Upload multiple files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', MAX_MULTIPART_FILES_PER_REQUEST, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
  ) {
    return this.filesService.uploadMultiple(files, userId);
  }

  /** Same auth as GET :id; avoids fetch()+302 to S3, which triggers browser CORS on the storage origin. */
  @Get(':id/signed-url')
  @Roles(
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.SUPPORT,
    UserRole.TRADER,
    UserRole.PAYOUT_TRADER,
    UserRole.MERCHANT,
  )
  @ApiOperation({
    summary:
      'Temporary HTTPS URL plus mime type (JSON). For SPA embedding without redirect+CORS; avoids a separate metadata round-trip.',
  })
  async getSignedUrlJson(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: FileDownloadActor,
  ): Promise<{ url: string; mimeType: string }> {
    return this.filesService.getSignedUrlPayload(id, user);
  }

  @Get(':id/metadata')
  @Roles(
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.SUPPORT,
    UserRole.TRADER,
    UserRole.PAYOUT_TRADER,
    UserRole.MERCHANT,
  )
  @ApiOperation({ summary: 'Get file metadata (same access rules as download)' })
  async getMetadata(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: FileDownloadActor,
  ) {
    return this.filesService.getMetadata(id, user);
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.SUPPORT,
    UserRole.TRADER,
    UserRole.PAYOUT_TRADER,
    UserRole.MERCHANT,
  )
  @ApiOperation({
    summary: 'Download file via presigned S3 URL — access limited by role (appeal proofs, staff, uploader)',
  })
  async getFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @CurrentUser() user: FileDownloadActor,
  ) {
    const url = await this.filesService.getSignedUrl(id, user);
    res.redirect(url);
  }

  /**
   * Hard delete: removes the S3 object and DB row. Refuses with 409 when the file is
   * still attached to an appeal proof, pay-in fork chat proof, bank logo, or a pay-out
   * completion proof. Use the matching cabinet endpoint (e.g. payout `completion-proof/:fileId`)
   * to first detach, then purge.
   */
  @Delete(':id')
  @HttpCode(204)
  @Roles(
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.TRADER,
    UserRole.PAYOUT_TRADER,
    UserRole.MERCHANT,
  )
  @ApiOperation({
    summary: 'Hard-delete an uploaded file (S3 + DB). Uploader or admin/owner only; refuses while attached.',
  })
  async deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: FileDownloadActor,
  ): Promise<void> {
    await this.filesService.deleteOrphanFile({ id: user.id, role: user.role }, id);
  }
}

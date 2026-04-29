import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
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
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MAX_FILE_SIZE_BYTES } from '@p2p/shared';
import { UserRole } from '@p2p/shared';

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
    FilesInterceptor('files', 10, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
  ) {
    return this.filesService.uploadMultiple(files, userId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Get file (redirects to presigned S3 URL) — admin/support only' })
  async getFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const url = await this.filesService.getSignedUrl(id);
    res.redirect(url);
  }

  @Get(':id/metadata')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Get file metadata — admin/support only' })
  async getMetadata(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.getMetadata(id);
  }
}

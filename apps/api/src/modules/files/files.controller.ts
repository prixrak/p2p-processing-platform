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
import { MAX_FILE_SIZE_BYTES } from '@p2p/shared';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
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
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.filesService.upload(file);
  }

  @Post('upload/batch')
  @ApiOperation({ summary: 'Upload multiple files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
    return this.filesService.uploadMultiple(files);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file (redirects to presigned S3 URL)' })
  async getFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const url = await this.filesService.getSignedUrl(id);
    res.redirect(url);
  }

  @Get(':id/metadata')
  @ApiOperation({ summary: 'Get file metadata' })
  async getMetadata(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.getMetadata(id);
  }
}

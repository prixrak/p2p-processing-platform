import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UploadedFiles,
  UseInterceptors,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { PayinService } from './payin.service';
import { FilesService, UploadedFile as UploadedFileType } from '../files/files.service';

@ApiTags('Payment Page')
@Controller('pay')
export class PaymentPageController {
  constructor(
    private readonly payinService: PayinService,
    private readonly filesService: FilesService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get public order info for payment page' })
  async getOrder(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.payinService.getPublicOrderInfo(id);
    } catch {
      throw new NotFoundException('Order not found');
    }
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm payment from payment page' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files'))
  async confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const mappedFiles: UploadedFileType[] = (files ?? []).map((f) => ({
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      buffer: f.buffer,
    }));
    return this.payinService.confirmFromPaymentPage(id, mappedFiles);
  }
}

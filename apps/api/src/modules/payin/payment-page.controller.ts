import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFiles,
  UseInterceptors,
  ParseUUIDPipe,
  NotFoundException,
  Sse,
  Header,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SkipThrottle } from '@nestjs/throttler';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiProduces } from '@nestjs/swagger';
import { MAX_FILE_SIZE_BYTES } from '@p2p/shared';
import { PayinService } from './payin.service';
import { PayinRealtimeService } from './payin-realtime.service';
import { FilesService, UploadedFile as UploadedFileType } from '../files/files.service';

@ApiTags('Payment Page')
@Controller('pay')
export class PaymentPageController {
  constructor(
    private readonly payinService: PayinService,
    private readonly filesService: FilesService,
    private readonly payinRealtime: PayinRealtimeService,
  ) {}

  @SkipThrottle()
  @Sse(':id/stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({ summary: 'SSE stream for Pay-In order updates for this order' })
  @ApiProduces('text/event-stream')
  streamOrderPayin(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return this.payinRealtime.streamForOrder(id);
  }

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
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
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

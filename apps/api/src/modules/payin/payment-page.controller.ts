import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFiles,
  UseInterceptors,
  ParseUUIDPipe,
  NotFoundException,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MAX_FILE_SIZE_BYTES, MAX_MULTIPART_FILES_PER_REQUEST } from '@p2p/shared';
import { PayinService } from './payin.service';
import { PayinRealtimeService } from './payin-realtime.service';
import { mapUploadedFiles } from '../../common/files/multer-mapper';
import { SseStream } from '../../common/decorators/sse-stream.decorator';

@ApiTags('Payment Page')
@Controller('pay')
export class PaymentPageController {
  constructor(
    private readonly payinService: PayinService,
    private readonly payinRealtime: PayinRealtimeService,
  ) {}

  @SseStream(':id/stream')
  @ApiOperation({ summary: 'SSE stream for Pay-In order updates for this order' })
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
  @UseInterceptors(
    FilesInterceptor('files', MAX_MULTIPART_FILES_PER_REQUEST, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.payinService.confirmFromPaymentPage(id, mapUploadedFiles(files));
  }
}

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createPinoParams } from './pino-http.options';

@Module({
  imports: [LoggerModule.forRoot(createPinoParams())],
  exports: [LoggerModule],
})
export class ApiLoggingModule {}

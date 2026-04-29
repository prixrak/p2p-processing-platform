import './load-env';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from '@p2p/config';
import { ExternalApiHeaders } from '@p2p/shared';
import type { INestApplication } from '@nestjs/common';
import { registerProcessHandlers } from './process-lifecycle';
import { correlationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { requestTimeoutMiddleware } from './common/middleware/request-timeout.middleware';
import type { Request, Response } from 'express';

let nestApp: INestApplication | null = null;
registerProcessHandlers(() => nestApp);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false,
  });

  nestApp = app;

  app.useLogger(app.get(PinoNestLogger));

  app.useBodyParser('json', {
    limit: config.http.jsonBodyLimit,
    verify: (req: Request, _res: Response, buf: Buffer) => {
      if (Buffer.isBuffer(buf)) {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      }
      return true;
    },
  });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: config.http.urlencodedBodyLimit,
  });

  app.use(correlationIdMiddleware);
  app.use(requestTimeoutMiddleware(config.http.requestTimeoutMs));

  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  app.use(helmet());

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: config.app.frontendUrl,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.app.nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('P2P Processing Platform API')
      .setDescription('External API for merchants and internal API for dashboards')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', name: ExternalApiHeaders.API_KEY, in: 'header' },
        'hmac-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.app.port);
  // SSE (Pay-In streams): place behind a reverse proxy with buffering disabled, e.g. nginx
  // `proxy_buffering off;`, `proxy_read_timeout` large enough, and/or `add_header X-Accel-Buffering no`.
  const logger = new Logger('Bootstrap');
  logger.log(`API running on http://localhost:${config.app.port}`);
  if (config.app.nodeEnv !== 'production') {
    logger.log(`Swagger docs at http://localhost:${config.app.port}/api/docs`);
  }
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(err instanceof Error ? err.stack : String(err), 'Application failed to start');
  process.exit(1);
});

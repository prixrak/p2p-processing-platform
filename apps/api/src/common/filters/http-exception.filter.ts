import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorDetails } from '@p2p/shared';
import { getRequestIdFromContext } from '../request-context';

const HTTP_STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  [HttpStatus.REQUEST_TIMEOUT]: 'REQUEST_TIMEOUT',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      this.logger.warn(
        `Exception after headers sent on ${request.method} ${request.url}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
      );
      return;
    }

    let status: number;
    let message: string;
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) ?? exception.message;
        if (Array.isArray(resp.message)) {
          message = 'Validation failed';
          details = { errors: resp.message };
        }
      } else {
        message = exception.message;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    const requestId =
      getRequestIdFromContext() ?? (request as { id?: string }).id;
    const path = request.path ?? request.url?.split('?')[0];

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        {
          requestId,
          method: request.method,
          path,
          status,
        },
        exception instanceof Error
          ? exception.stack ?? exception.message
          : String(exception),
      );
    }

    if (requestId) {
      details = { ...details, requestId };
    }

    const code = HTTP_STATUS_CODES[status] ?? 'UNKNOWN_ERROR';

    if (exception instanceof HttpException) {
      const ctx = {
        requestId,
        method: request.method,
        path,
        status,
        code,
      };
      if (status >= 500) {
        this.logger.error({ ...ctx, err: exception }, exception.message);
      } else if (status >= 400) {
        this.logger.warn({ ...ctx, message }, `HTTP ${status}`);
      }
    }

    const body: ErrorDetails = {
      timestamp: new Date().toISOString(),
      message,
      code,
      details,
    };

    response.status(status).json(body);
  }
}

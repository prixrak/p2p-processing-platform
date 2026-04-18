import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { ErrorDetails } from '@p2p/shared';
import { getRequestIdFromContext } from '../request-context';

const HTTP_STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

/**
 * Maps common Prisma errors to HTTP responses so services do not need ad-hoc try/catch per query.
 */
@Catch(PrismaClientKnownRequestError, PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: PrismaClientKnownRequestError | PrismaClientValidationError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      this.logger.warn(
        `Prisma error after headers sent on ${request.method} ${request.url}: ${exception.message}`,
      );
      return;
    }

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';
    let details: Record<string, unknown> = {};

    if (exception instanceof PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid query parameters';
      details = { prisma: 'validation_error' };
    } else {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Unique constraint violated';
          details = { target: exception.meta?.target };
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Foreign key constraint failed';
          break;
        case 'P2014':
          status = HttpStatus.BAD_REQUEST;
          message = 'The change you are trying to make would violate the required relation';
          break;
        default:
          this.logger.error(
            `Unhandled Prisma error ${exception.code} on ${request.method} ${request.url}`,
            exception.stack,
          );
          message = 'Database error';
      }
    }

    const requestId = getRequestIdFromContext();
    if (requestId) {
      details = { ...details, requestId };
    }

    const code = HTTP_STATUS_CODES[status] ?? 'UNKNOWN_ERROR';

    const body: ErrorDetails = {
      timestamp: new Date().toISOString(),
      message,
      code,
      details,
    };

    response.status(status).json(body);
  }
}

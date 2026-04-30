import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { config } from '@p2p/config';

/**
 * Protects inter-service HTTP routes. Set INTERNAL_API_KEY in production.
 * In non-production, missing key allows access (for local dev); set a key to enforce locally.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);
  private warnedDevOpen = false;

  canActivate(context: ExecutionContext): boolean {
    const expected = config.internal.apiKey?.trim() ?? '';
    const req = context.switchToHttp().getRequest<Request>();
    const provided = String(req.headers['x-internal-api-key'] ?? '').trim();

    if (config.app.nodeEnv === 'production' && !expected) {
      this.logger.error('INTERNAL_API_KEY is required in production');
      throw new ForbiddenException('Internal API disabled');
    }

    if (!expected) {
      if (!this.warnedDevOpen) {
        this.logger.warn(
          'INTERNAL_API_KEY is unset; /api/internal/* is open (development only). Set INTERNAL_API_KEY to enforce.',
        );
        this.warnedDevOpen = true;
      }
      return true;
    }

    if (provided !== expected) {
      throw new ForbiddenException('Invalid internal API key');
    }
    return true;
  }
}

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDITED_KEY, AuditedMetadata } from '../decorators/audited.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<
      AuditedMetadata | undefined
    >(AUDITED_KEY, [context.getHandler(), context.getClass()]);

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as
      | { id: string; role: string }
      | undefined;

    const ip =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      request.ip ??
      '';

    const entityId =
      (request.params?.id as string) ??
      (request.body?.id as string) ??
      null;

    return next.handle().pipe(
      tap(() => {
        this.auditService
          .log({
            actorId: user?.id ?? null,
            actorRole: user?.role ?? null,
            action: metadata.action,
            entityType: metadata.entityType,
            entityId,
            oldValue: null,
            newValue: null,
            ip,
          })
          .catch(() => {
            // Audit logging must never break the request flow
          });
      }),
    );
  }
}

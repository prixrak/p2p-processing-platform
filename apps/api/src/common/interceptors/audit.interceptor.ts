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
import { PrismaService } from '../../config/prisma.service';
import { AuditEntityType, type AuditEntityTypeValue } from '@p2p/shared';
import { AUDITED_KEY, AuditedMetadata } from '../decorators/audited.decorator';

/** Map entityType → Prisma delegate name so we can fetch the before-state. */
const ENTITY_TABLE_MAP: Record<AuditEntityTypeValue, string> = {
  [AuditEntityType.PayinOrder]: 'payinOrder',
  [AuditEntityType.PayoutOrder]: 'payoutOrder',
  [AuditEntityType.Trader]: 'traderProfile',
  [AuditEntityType.Merchant]: 'merchant',
  [AuditEntityType.User]: 'user',
  [AuditEntityType.Requisite]: 'requisite',
  [AuditEntityType.Bank]: 'bank',
  [AuditEntityType.PlatformSetting]: 'platformSetting',
  [AuditEntityType.Direction]: 'direction',
  [AuditEntityType.Settlement]: 'settlement',
  [AuditEntityType.Currency]: 'currency',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
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
      (request.params?.key as string) ??
      (request.body?.id as string) ??
      null;

    // Fetch old value before handler executes (best-effort)
    const oldValuePromise = this.fetchEntity(metadata.entityType, entityId);

    return next.handle().pipe(
      tap((responseData: unknown) => {
        oldValuePromise
          .then((oldValue) => {
            this.auditService
              .log({
                actorId: user?.id ?? null,
                actorRole: user?.role ?? null,
                action: metadata.action,
                entityType: metadata.entityType,
                entityId,
                oldValue,
                newValue: responseData ?? null,
                ip,
              })
              .catch(() => {
                // Audit logging must never break the request flow
              });
          })
          .catch(() => {
            // oldValue fetch failed — log without it
            this.auditService
              .log({
                actorId: user?.id ?? null,
                actorRole: user?.role ?? null,
                action: metadata.action,
                entityType: metadata.entityType,
                entityId,
                oldValue: null,
                newValue: responseData ?? null,
                ip,
              })
              .catch(() => {});
          });
      }),
    );
  }

  private async fetchEntity(entityType: AuditEntityTypeValue, entityId: string | null): Promise<unknown> {
    if (!entityId) return null;
    const table = ENTITY_TABLE_MAP[entityType];
    if (!table) return null;

    try {
      const model = (this.prisma as any)[table];
      if (!model?.findUnique) return null;

      // PlatformSetting uses "key" as PK, everything else uses "id"
      const where =
        entityType === AuditEntityType.PlatformSetting ? { key: entityId } : { id: entityId };
      return await model.findUnique({ where });
    } catch {
      return null;
    }
  }
}

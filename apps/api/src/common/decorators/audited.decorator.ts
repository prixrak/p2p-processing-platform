import { SetMetadata } from '@nestjs/common';
import type { AuditActionValue, AuditEntityTypeValue } from '@p2p/shared';

export const AUDITED_KEY = 'audited';

export interface AuditedMetadata {
  action: AuditActionValue;
  entityType: AuditEntityTypeValue;
}

export const Audited = (action: AuditActionValue, entityType: AuditEntityTypeValue) =>
  SetMetadata(AUDITED_KEY, { action, entityType } satisfies AuditedMetadata);

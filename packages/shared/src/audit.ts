/** Values stored in audit_log.entity_type — keep aligned with audit interceptor mapping. */
export const AuditEntityType = {
  PayinOrder: 'PayinOrder',
  PayoutOrder: 'PayoutOrder',
  Trader: 'Trader',
  Merchant: 'Merchant',
  User: 'User',
  Requisite: 'Requisite',
  Bank: 'Bank',
  PlatformSetting: 'PlatformSetting',
  Direction: 'Direction',
  Settlement: 'Settlement',
  Currency: 'Currency',
} as const;

export type AuditEntityTypeValue = (typeof AuditEntityType)[keyof typeof AuditEntityType];

/** Values stored in audit_log.action for decorated routes. */
export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  ACTIVATE: 'ACTIVATE',
  DEACTIVATE: 'DEACTIVATE',
  LOGIN: 'LOGIN',
  ENABLE_2FA: 'ENABLE_2FA',
  LOGIN_2FA: 'LOGIN_2FA',
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  DEACTIVATE_USER: 'DEACTIVATE_USER',
  DELETE_USER: 'DELETE_USER',
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
  /** Cascade idle anchor reset because requisite min/max nominal range changed (TZ observability). */
  CASCADE_IDLE_ANCHOR_RESET: 'CASCADE_IDLE_ANCHOR_RESET',
  /** Admin/owner manual Pay-In / Pay-Out status override (`PATCH admin/orders/:id/status`). */
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

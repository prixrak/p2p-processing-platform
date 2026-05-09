export enum PayInOrderStatus {
  PENDING = 'PENDING',
  NEW = 'NEW',
  VERIFIED = 'VERIFIED',
  PAID = 'PAID',
  UNDERPAID = 'UNDERPAID',
  OVERPAID = 'OVERPAID',
  APPEAL = 'APPEAL',
  CANCELED = 'CANCELED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  /** Cascade could not assign any active requisite for this amount/currency. */
  NO_REQUISITE = 'NO_REQUISITE',
}

export enum PayOutOrderStatus {
  PENDING = 'PENDING',
  NEW = 'NEW',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
}

/** Trader/specialist rejection reason when a pay-out cannot proceed (e.g. inactive card, funds returned). */
export enum PayoutTraderRejectReason {
  FOREIGN_CARD = 'FOREIGN_CARD',
  CARD_REFUND_IN_PROGRESS = 'CARD_REFUND_IN_PROGRESS',
  OTHER = 'OTHER',
}

export enum UserRole {
  TRADER = 'TRADER',
  PAYOUT_TRADER = 'PAYOUT_TRADER',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT',
  MERCHANT = 'MERCHANT',
  OWNER = 'OWNER',
  REFERRAL = 'REFERRAL',
}

export enum DirectionType {
  PAYIN = 'PAYIN',
  PAYOUT = 'PAYOUT',
}

export enum DetailsType {
  CARD = 'CARD',
  IBAN = 'IBAN',
}

export enum WebhookMethod {
  PAYIN_UPDATE_STATUS_ORDER = 'payin_update_status_order',
  PAYOUT_UPDATE_STATUS_ORDER = 'payout_update_status_order',
}

export enum WebhookOutboxStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  DLQ = 'DLQ',
}

export enum AppealStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

export enum SettlementType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum RequisiteType {
  CARD = 'CARD',
  IBAN = 'IBAN',
}

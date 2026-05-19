import type { RequisiteType } from '@p2p/shared';

export interface VolumeBreakdown {
  amountInProcessing: number;
  amountCompleted: number;
  amountRemaining: number;
  opsInProcessing: number;
  opsCompleted: number;
  opsRemaining: number;
}

export type RequisiteDisabledReason = 'LIMIT_AMOUNT' | 'LIMIT_TX' | 'MANUAL';

export interface RequisiteApiRow {
  id: string;
  type: RequisiteType;
  number: string;
  owner: string;
  cardHolderName: string;
  isActive: boolean;
  /** Persisted disable reason (`LIMIT_*` vs `MANUAL`) when inactive. */
  disabledReason?: RequisiteDisabledReason | string | null;
  acceptsOtherBanks: boolean;
  minAmount: unknown;
  maxAmount: unknown;
  limitTotalAmount: unknown;
  limitTotalOps: number;
  usedAmount: unknown;
  usedOps: number;
  currency: string;
  bank: { id: number; name: string } | null;
  volume?: VolumeBreakdown;
}

export interface RequisiteGroupApi {
  id: string;
  name: string;
  currency: string | { code: string };
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  paymentMethod: { id: string; displayName: string; name: string };
  requisites: RequisiteApiRow[];
}

export interface BankOption {
  id: number;
  name: string;
}

export interface PaymentMethodRow {
  id: string;
  displayName: string;
  name: string;
  availability: 'PAYIN' | 'PAYOUT' | 'BOTH';
  country?: { currency?: { code: string } | null } | null;
}

export interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  ip: string | null;
  actor: { email: string; role: string } | null;
  oldValue: unknown;
  newValue: unknown;
}

export interface PayinAssignRangeRow {
  requisite_id: string;
  eff_min: number | null;
  eff_max: number | null;
  fork_autolimit_active: boolean;
  participates_in_cascade: boolean;
}

export interface RequisiteFormData {
  type: RequisiteType;
  number: string;
  owner: string;
  card_holder_name: string;
  bank_id: string;
  accepts_other_banks: boolean;
  min_amount: number;
  max_amount: number;
  limit_amount: number;
  limit_operations: number;
}

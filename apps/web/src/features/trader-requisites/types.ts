import type { RequisiteType } from '@p2p/shared';

export interface VolumeBreakdown {
  amountInProcessing: number;
  amountCompleted: number;
  amountRemaining: number;
}

export interface RequisiteApiRow {
  id: string;
  type: RequisiteType;
  number: string;
  owner: string;
  isActive: boolean;
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
  paymentMethod: { id: string; displayName: string; name: string } | null;
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
}

export interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
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
  bank_id: string;
  accepts_other_banks: boolean;
  min_amount: number;
  max_amount: number;
  limit_amount: number;
  limit_operations: number;
}

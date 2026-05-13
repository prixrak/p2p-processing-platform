import { z } from 'zod';
import { RequisiteType, UserRole } from '@p2p/shared';
import {
  IBAN_GLOBAL_MAX,
  IBAN_GLOBAL_MIN,
  ibanExpectedLengthForCountry,
} from './iban-registry';

/** Positive decimal entered as a string (allows commas stripped by caller via Number). */
export const positiveAmountString = z
  .string()
  .trim()
  .min(1, 'Enter a positive amount')
  .refine((s) => {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) && n > 0;
  }, 'Amount must be greater than zero');

function isPlausibleCryptoAddress(s: string): boolean {
  const t = s.trim();
  if (t.length < 26 && !/^0x[a-fA-F0-9]{40}$/.test(t)) return false;
  if (/^T[1-9A-HJ-NP-Za-km-z]{25,}$/.test(t)) return true;
  if (/^0x[a-fA-F0-9]{40}$/.test(t)) return true;
  return /^[a-zA-Z0-9]{26,}$/.test(t);
}

export const optionalAuditCryptoAddress = z
  .string()
  .trim()
  .refine((s) => s.length === 0 || isPlausibleCryptoAddress(s), {
    message: 'Enter a valid TRON or EVM payout address, or leave blank',
  });

export const requiredCryptoAddress = z
  .string()
  .trim()
  .min(1, 'USDT payout address is required')
  .refine((s) => isPlausibleCryptoAddress(s), 'Enter a valid TRON or EVM address');

export const loginCredentialsSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const loginTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your app'),
});

export const ownerCreateUserFormSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters'),
    role: z.nativeEnum(UserRole),
    countryId: z.string(),
    payoutRate: z.number(),
    overdraftLimitUsdt: z.number(),
    payinRate: z.number(),
    traderPayoutRate: z.number(),
    payoutMinLimit: z.number(),
    payoutMaxLimit: z.number(),
    processingMethod: z.enum(['CARD', 'FORK']),
    cascadeRatingMultiplier: z.number(),
    referralPercent: z.number(),
    referralCurrency: z.string(),
    merchantName: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.role === UserRole.TRADER) {
      if (
        !Number.isFinite(data.overdraftLimitUsdt) ||
        data.overdraftLimitUsdt < 0 ||
        data.overdraftLimitUsdt > 1e12
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['overdraftLimitUsdt'],
          message: 'Overdraft must be between 0 and 1e12 USDT',
        });
      }
      if (!Number.isFinite(data.payinRate) || data.payinRate < 0 || data.payinRate > 0.5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payinRate'],
          message: 'Pay-In rate must be between 0 and 0.5',
        });
      }
      if (
        !Number.isFinite(data.traderPayoutRate) ||
        data.traderPayoutRate < 0 ||
        data.traderPayoutRate > 0.5
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['traderPayoutRate'],
          message: 'Pay-Out rate must be between 0 and 0.5',
        });
      }
      if (!Number.isFinite(data.payoutMinLimit) || data.payoutMinLimit < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payoutMinLimit'],
          message: 'Min amount must be zero or greater',
        });
      }
      if (!Number.isFinite(data.payoutMaxLimit) || data.payoutMaxLimit < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payoutMaxLimit'],
          message: 'Max amount must be zero or greater',
        });
      }
      if (data.payoutMaxLimit > 0 && data.payoutMinLimit > data.payoutMaxLimit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payoutMinLimit'],
          message: 'Min cannot exceed max when max is set',
        });
      }
      if (
        !Number.isFinite(data.cascadeRatingMultiplier) ||
        data.cascadeRatingMultiplier < 0.01 ||
        data.cascadeRatingMultiplier > 100
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cascadeRatingMultiplier'],
          message: 'Cascade rating multiplier must be between 0.01 and 100',
        });
      }
    }
    if (data.role === UserRole.PAYOUT_TRADER) {
      if (!data.countryId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['countryId'],
          message: 'Select a country',
        });
      }
      if (!Number.isFinite(data.payoutRate) || data.payoutRate < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payoutRate'],
          message: 'Payout rate must be zero or greater',
        });
      }
      if (data.payoutRate > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payoutRate'],
          message: 'Payout rate cannot exceed 1 (100%)',
        });
      }
    }
    if (data.role === UserRole.REFERRAL) {
      if (
        !Number.isFinite(data.referralPercent) ||
        data.referralPercent < 0 ||
        data.referralPercent > 100
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['referralPercent'],
          message: 'Referral percent must be between 0 and 100',
        });
      }
      if (!data.referralCurrency.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['referralCurrency'],
          message: 'Enter a currency code',
        });
      }
    }
    if (data.role === UserRole.MERCHANT) {
      if (!data.merchantName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['merchantName'],
          message: 'Enter merchant display name',
        });
      }
    }
  });

export const settlementTraderFieldsSchema = z.object({
  traderId: z.string().trim().min(1, 'Select a trader'),
  traderAmount: positiveAmountString,
  traderCurrency: z.string().trim().min(1, 'Select a currency'),
  traderNote: z.string(),
});

export const settlementPayoutFieldsSchema = z.object({
  payoutSpecialistId: z.string().trim().min(1, 'Select a Pay-Out specialist'),
  payoutAmount: positiveAmountString,
  payoutUsdtAddress: optionalAuditCryptoAddress,
  payoutNote: z.string(),
});

export const settlementMerchantFieldsSchema = z.object({
  merchantId: z.string().trim().min(1, 'Select a merchant'),
  merchantDebitAmount: positiveAmountString,
  merchantCurrency: z.string().trim().min(1, 'Select a currency'),
  manualRate: positiveAmountString,
  usdtEquivalent: positiveAmountString,
  merchantUsdtAddress: requiredCryptoAddress,
  merchantNote: z.string(),
});

export const requisiteGroupCreateSchema = z.object({
  name: z.string().trim().min(1, 'Enter a group name').max(120),
  currency: z.string().trim().min(1, 'Select a currency'),
  payment_method_id: z.string().trim().uuid('Select a payment method'),
});

export const requisiteGroupEditSchema = z.object({
  name: z.string().trim().min(1, 'Enter a group name').max(120),
  payment_method_id: z.string().trim().uuid('Select a payment method'),
});

function finiteNonNegative(n: number, path: string, ctx: z.RefinementCtx) {
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'Must be zero or greater',
    });
  }
}

/** PAN digits only (spaces allowed in raw input). */
function paymentCardDigitsCompact(raw: string): string {
  return raw.replace(/\D/g, '');
}

function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (ch) =>
    (ch.charCodeAt(0) - 55).toString(),
  );
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (remainder * 10 + (expanded.charCodeAt(i) - 48)) % 97;
  }
  return remainder;
}

function validateRequisiteNumber(type: RequisiteType, raw: string, ctx: z.RefinementCtx) {
  const trimmed = raw.trim();
  if (!trimmed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['number'],
      message: type === RequisiteType.CARD ? 'Enter card number' : 'Enter IBAN',
    });
    return;
  }
  if (type === RequisiteType.CARD) {
    if (/[^\d\s-]/.test(trimmed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['number'],
        message: 'Card number may only contain digits, spaces, or hyphens',
      });
      return;
    }
    const compact = paymentCardDigitsCompact(trimmed);
    if (compact.length < 13 || compact.length > 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['number'],
        message: 'Card number must be 13–16 digits',
      });
      return;
    }
    return;
  }
  if (type === RequisiteType.IBAN) {
    const iban = normalizeIban(trimmed);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['number'],
        message:
          'Invalid IBAN: use two letters (country), two digits (check), then the account reference',
      });
      return;
    }
    const cc = iban.slice(0, 2);
    const expectedLen = ibanExpectedLengthForCountry(cc);
    if (expectedLen !== undefined) {
      if (iban.length !== expectedLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['number'],
          message: `IBAN for ${cc} must be exactly ${expectedLen} characters`,
        });
        return;
      }
    } else if (iban.length < IBAN_GLOBAL_MIN || iban.length > IBAN_GLOBAL_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['number'],
        message: `IBAN length must be between ${IBAN_GLOBAL_MIN} and ${IBAN_GLOBAL_MAX} characters`,
      });
      return;
    }
    if (ibanMod97(iban) !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['number'],
        message: 'Invalid IBAN (checksum)',
      });
    }
  }
}

export const requisiteCreateSchema = z
  .object({
    type: z.nativeEnum(RequisiteType),
    number: z.string(),
    owner: z.string().trim().min(2, 'Enter the account owner name'),
    bank_id: z
      .string()
      .trim()
      .min(1, 'Select a bank')
      .regex(/^\d+$/, 'Select a bank')
      .refine((s) => Number(s) >= 1, 'Select a bank'),
    accepts_other_banks: z.boolean(),
    min_amount: z.number(),
    max_amount: z.number(),
    limit_amount: z.number(),
    limit_operations: z.number(),
  })
  .superRefine((data, ctx) => {
    validateRequisiteNumber(data.type, data.number, ctx);
    finiteNonNegative(data.min_amount, 'min_amount', ctx);
    finiteNonNegative(data.max_amount, 'max_amount', ctx);
    finiteNonNegative(data.limit_amount, 'limit_amount', ctx);
    if (!Number.isFinite(data.limit_operations) || data.limit_operations < 0 || !Number.isInteger(data.limit_operations)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limit_operations'],
        message: 'Enter a whole number zero or greater',
      });
    }
    if (
      Number.isFinite(data.min_amount) &&
      Number.isFinite(data.max_amount) &&
      data.max_amount > 0 &&
      data.min_amount > data.max_amount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_amount'],
        message: 'Max amount must be greater than or equal to min',
      });
    }
  });

export const requisiteLimitsSchema = z
  .object({
    accepts_other_banks: z.boolean(),
    min_amount: z.number(),
    max_amount: z.number(),
    limit_amount: z.number(),
    limit_operations: z.number(),
  })
  .superRefine((data, ctx) => {
    finiteNonNegative(data.min_amount, 'min_amount', ctx);
    finiteNonNegative(data.max_amount, 'max_amount', ctx);
    finiteNonNegative(data.limit_amount, 'limit_amount', ctx);
    if (!Number.isFinite(data.limit_operations) || data.limit_operations < 0 || !Number.isInteger(data.limit_operations)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limit_operations'],
        message: 'Enter a whole number zero or greater',
      });
    }
    if (
      Number.isFinite(data.min_amount) &&
      Number.isFinite(data.max_amount) &&
      data.max_amount > 0 &&
      data.min_amount > data.max_amount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max_amount'],
        message: 'Max amount must be greater than or equal to min',
      });
    }
  });

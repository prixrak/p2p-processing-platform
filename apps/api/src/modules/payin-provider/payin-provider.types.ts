/** Input for optional Pay-In external provider reserve call (TZ §5). */
export type PayinProviderReserveInput = {
  /** Stable id for idempotent provider API (e.g. pre-generated Pay-In order id). */
  idempotencyKey: string;
  amount: number;
  currencyCode: string;
  parserRateFiatPerUsdt?: number;
};

/** Result of attempting to assign a Pay-In to the external provider tier. */
export type PayinProviderReserveResult =
  | { kind: 'declined'; reason?: string }
  | { kind: 'unavailable'; reason?: string }
  | { kind: 'accepted'; externalRef: string };

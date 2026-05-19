/**
 * Central React Query key factories for the web app.
 *
 * Tuple shapes must stay stable: settlement list merge helpers in `query-cache-merge.ts`
 * rely on fixed index positions for admin/owner settlement keys.
 */

/** Admin / owner staff cabinets share these query roots for trader directory APIs. */
export type StaffRolePrefix = 'admin' | 'owner';

export const staffTraderKeys = {
  list: (prefix: StaffRolePrefix) => [prefix, 'traders', 'list'] as const,
  detail: (prefix: StaffRolePrefix, id: string) => [prefix, 'traders', id] as const,
  traderOptions: (prefix: StaffRolePrefix) => [prefix, 'traders', 'options'] as const,
};

export {
  currencyKeys,
  fetchCurrencyList,
  invalidateCurrencyListQueries,
  type CurrencyListItem,
} from './currency-queries';

export {
  countryKeys,
  fetchCountryList,
  invalidateCountryListQueries,
  mergeCreatedCountry,
  normalizeCountryListRow,
  type CountryListItem,
} from './country-queries';

const traderRoot = ['trader'] as const;
const merchantRoot = ['merchant'] as const;
const adminRoot = ['admin'] as const;
const ownerRoot = ['owner'] as const;
const supportRoot = ['support'] as const;
const referralRoot = ['referral'] as const;
const payoutTraderRoot = ['payout-trader'] as const;

export type PayoutCabinetScope = 'trader' | 'payout-trader';

/** Pay-Out trader / specialist payout cabinet (shared SSE invalidation). */
export const payoutCabinetKeys = {
  payoutOrders: (scope: PayoutCabinetScope, params: unknown) =>
    [scope, 'payout-orders', params] as const,
  payoutOrdersScope: (scope: PayoutCabinetScope) => [scope, 'payout-orders'] as const,
  payoutPool: (scope: PayoutCabinetScope, params?: unknown) =>
    [scope, 'payout-pool', params ?? {}] as const,
  /** Sidebar pool total; invalidated with `payoutPool` prefix. */
  payoutPoolNavBadge: (scope: PayoutCabinetScope) =>
    [scope, 'payout-pool', 'nav-badge'] as const,
  specialistSummary: () => [...payoutTraderRoot, 'summary'] as const,
};

export const traderKeys = {
  root: traderRoot,
  dashboardStats: () => [...traderRoot, 'dashboard-stats'] as const,
  /** GET /api/traders/me — profile including Pay-In cascade processing_method */
  profile: () => [...traderRoot, 'profile'] as const,
  payinOrders: (params: unknown) => [...traderRoot, 'payin-orders', params] as const,
  payinOrdersScope: [...traderRoot, 'payin-orders'] as const,
  /** Pay-In count for sidebar (lightweight `limit=1`); invalidated with `payinOrdersScope`. */
  payinNavBadge: () => [...traderRoot, 'payin-orders', 'nav-badge'] as const,
  balancesMe: () => [...traderRoot, 'balances', 'me'] as const,
  usdtWallet: () => [...traderRoot, 'usdt-wallet'] as const,
  balanceTransactions: (
    page: number,
    currency: string,
    dateFrom: string,
    dateTo: string,
    txType: string,
  ) => [...traderRoot, 'balance-transactions', page, currency, dateFrom, dateTo, txType] as const,
  balanceTransactionsScope: [...traderRoot, 'balance-transactions'] as const,
  appealsScope: [...traderRoot, 'appeals'] as const,
  appealsQuery: (
    listBucket: 'current' | 'history',
    page: number,
    limit: number,
    search?: string,
  ) =>
    [...traderRoot, 'appeals', 'list', listBucket, page, limit, search ?? ''] as const,
  telegram: () => [...traderRoot, 'telegram'] as const,
  statistics: (period: string) => [...traderRoot, 'statistics', period] as const,
  analytics: (queryParams: unknown) => [...traderRoot, 'analytics', queryParams] as const,
  requisiteGroups: (archivedTab: boolean) => [...traderRoot, 'requisite-groups', archivedTab] as const,
  requisiteGroupsScope: [...traderRoot, 'requisite-groups'] as const,
  payinAssignRanges: [...traderRoot, 'payin-assign-ranges'] as const,
  requisiteHistory: (requisiteId: string | null) =>
    [...traderRoot, 'requisite', 'history', requisiteId] as const,
};

export const merchantKeys = {
  root: merchantRoot,
  orders: (filters: unknown) => [...merchantRoot, 'orders', filters] as const,
  ordersScope: [...merchantRoot, 'orders'] as const,
  stats: () => [...merchantRoot, 'stats'] as const,
  balances: () => [...merchantRoot, 'balances'] as const,
  analytics: (period: unknown) => [...merchantRoot, 'analytics', period] as const,
  analyticsScope: [...merchantRoot, 'analytics'] as const,
  directions: () => [...merchantRoot, 'directions'] as const,
  /** Platform `Direction` rows when the merchant has no custom `MerchantDirection` terms */
  directionsPlatformDefaults: () => [...merchantRoot, 'directions', 'platform'] as const,
  apiKeys: () => [...merchantRoot, 'api-keys'] as const,
  webhooks: (filters: unknown) => [...merchantRoot, 'webhooks', filters] as const,
  webhooksScope: [...merchantRoot, 'webhooks'] as const,
  balanceSummary: (sumFrom: string, sumTo: string) =>
    [...merchantRoot, 'balance-summary', sumFrom, sumTo] as const,
  balanceTransactions: (txPage: number, txFrom: string, txTo: string, txType: string) =>
    [...merchantRoot, 'balance-transactions', txPage, txFrom, txTo, txType] as const,
  settlementsHistory: () => [...merchantRoot, 'settlements-history'] as const,
};

const adminSettlementsScope = ['admin', 'settlements'] as const;
const ownerSettlementsScope = ['owner', 'settlements'] as const;

export const settlementKeys = {
  admin: {
    scope: adminSettlementsScope,
    list: (
      page: number,
      participantRole: string,
      participantId: string,
      typeFilter: string,
      currency: string,
      dateFrom: string,
      dateTo: string,
      minAmount: string,
      maxAmount: string,
    ) =>
      [
        ...adminSettlementsScope,
        page,
        participantRole,
        participantId,
        typeFilter,
        currency,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
      ] as const,
  },
  owner: {
    scope: ownerSettlementsScope,
    list: (
      tab: string,
      page: number,
      participantRole: string,
      participantId: string,
      currency: string,
      dateFrom: string,
      dateTo: string,
      minAmount: string,
      maxAmount: string,
    ) =>
      [
        ...ownerSettlementsScope,
        tab,
        page,
        participantRole,
        participantId,
        currency,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
      ] as const,
    detail: (detailId: string | null) => ['owner', 'settlement-details', detailId] as const,
  },
  payoutSpecialistOptions: ['settlements', 'payout-specialist-options'] as const,
  merchantsBriefOptions: ['merchants', 'brief-options'] as const,
  merchantBalances: (merchantId: string) => ['merchants', merchantId, 'balances'] as const,
  /** Staff settlement modal: GET /api/traders/:id snapshot for ledger + overdraft. */
  traderLedgerForSettlementModal: (prefix: StaffRolePrefix, traderId: string) =>
    [prefix, 'settlements', 'modal-trader-ledger', traderId] as const,
};

export const staffMerchantsOptionsKey = (prefix: 'admin' | 'owner') =>
  [prefix, 'merchants-options'] as const;

export const banksKeys = {
  list: ['banks', 'list'] as const,
};

export const paymentMethodsKeys = {
  list: ['payment-methods', 'list'] as const,
};

export const ownerReferenceKeys = {
  banks: ['owner', 'banks'] as const,
  paymentMethods: ['owner', 'payment-methods'] as const,
};

export const staffKeys = {
  usersDirectory: (prefix: StaffRolePrefix) => [prefix, 'users', 'directory'] as const,
  merchantDirections: (prefix: StaffRolePrefix, merchantId: string | null) =>
    [prefix, 'merchant-directions', merchantId] as const,
};

export const adminKeys = {
  stats: () => [...adminRoot, 'stats'] as const,
  audit: (filters: unknown) => [...adminRoot, 'audit', filters] as const,
  orders: (filters: unknown) => [...adminRoot, 'orders', filters] as const,
  ordersScope: [...adminRoot, 'orders'] as const,
  tradersOptions: () => [...adminRoot, 'traders', 'options'] as const,
  statistics: () => [...adminRoot, 'statistics'] as const,
  ordersLogs: (filters: unknown) => [...adminRoot, 'orders-logs', filters] as const,
  ordersLogsScope: [...adminRoot, 'orders-logs'] as const,
  orderDetails: (orderId: string | null) => [...adminRoot, 'order-details', orderId] as const,
  orderDetailsScope: [...adminRoot, 'order-details'] as const,
};

export const ownerKeys = {
  stats: () => [...ownerRoot, 'stats'] as const,
  audit: (
    page: number,
    search: string,
    actionFilter: string,
    entityFilter: string,
    dateFrom: string,
    dateTo: string,
  ) => [...ownerRoot, 'audit', page, search, actionFilter, entityFilter, dateFrom, dateTo] as const,
  orders: (tab: string, page: number, statusFilter: string, search: string) =>
    [...ownerRoot, 'orders', tab, page, statusFilter, search] as const,
  ordersScope: [...ownerRoot, 'orders'] as const,
  orderDetails: (orderId: string | null) => [...ownerRoot, 'order-details', orderId] as const,
  orderDetailsScope: [...ownerRoot, 'order-details'] as const,
  directions: () => [...ownerRoot, 'directions'] as const,
  statistics: (period: unknown) => [...ownerRoot, 'statistics', period] as const,
  ordersLogs: (filters: unknown) => [...ownerRoot, 'orders-logs', filters] as const,
  ordersLogsScope: [...ownerRoot, 'orders-logs'] as const,
};

export const supportKeys = {
  stats: () => [...supportRoot, 'stats'] as const,
  disputes: (tab: string, page: number, search: string) =>
    [...supportRoot, 'disputes', tab, page, search] as const,
  disputesScope: [...supportRoot, 'disputes'] as const,
  disputeDetails: (id: string | null) => [...supportRoot, 'dispute-details', id] as const,
  orders: (
    tab: string,
    page: number,
    statusFilter: string,
    merchantFilter: string,
    traderFilter: string,
  ) =>
    [...supportRoot, 'orders', tab, page, statusFilter, merchantFilter, traderFilter] as const,
  orderDetails: (orderId: string | null) => [...supportRoot, 'order-details', orderId] as const,
  orderDetailsScope: [...supportRoot, 'order-details'] as const,
  ordersScope: [...supportRoot, 'orders'] as const,
  balances: (tab: string, page: number, search: string) =>
    [...supportRoot, 'balances', tab, page, search] as const,
};

export const referralKeys = {
  me: () => [...referralRoot, 'me'] as const,
  statistics: () => [...referralRoot, 'statistics'] as const,
};

const cascadeRoot = [...adminRoot, 'cascade'] as const;

export const cascadeKeys = {
  scope: cascadeRoot,
  settings: () => [...cascadeRoot, 'settings'] as const,
  methodPolicy: () => [...cascadeRoot, 'method-policy'] as const,
  nominals: () => [...cascadeRoot, 'nominals'] as const,
  coverage: (currency: string) => [...cascadeRoot, 'coverage', currency] as const,
  requisiteRatings: (currency: string, qs: string) =>
    [...cascadeRoot, 'requisite-ratings', currency, qs] as const,
  assignmentExplain: (currency: string, amountKey: string) =>
    [...cascadeRoot, 'assignment-explain', currency, amountKey] as const,
};

export const treasuryKeys = {
  scope: (staffPrefix: StaffRolePrefix) => [staffPrefix, 'treasury'] as const,
  exchangeRate: (staffPrefix: StaffRolePrefix) =>
    [...treasuryKeys.scope(staffPrefix), 'exchange-rate'] as const,
  incomeSummary: (staffPrefix: StaffRolePrefix) =>
    [...treasuryKeys.scope(staffPrefix), 'income-summary'] as const,
  incomeRecent: (staffPrefix: StaffRolePrefix) =>
    [...treasuryKeys.scope(staffPrefix), 'income-recent'] as const,
  withdrawals: (staffPrefix: StaffRolePrefix) =>
    [...treasuryKeys.scope(staffPrefix), 'withdrawals'] as const,
  deposits: (staffPrefix: StaffRolePrefix) =>
    [...treasuryKeys.scope(staffPrefix), 'deposits'] as const,
  operations: (staffPrefix: StaffRolePrefix, opFrom: string, opTo: string) =>
    [...treasuryKeys.scope(staffPrefix), 'operations', opFrom, opTo] as const,
};

export const adminPayoutPoolKeys = {
  scope: [...adminRoot, 'payout-pool'] as const,
  global: () => [...adminRoot, 'payout-pool', 'global'] as const,
  merchants: () => [...adminRoot, 'payout-pool', 'merchants'] as const,
  merchantDirectory: (q: string) => [...adminRoot, 'payout-pool', 'merchants-directory', q] as const,
};

/** Trader requisite audit history modal (tuple shape must stay stable). */
export const requisiteKeys = {
  history: (requisiteId: string | null) => ['requisite', 'history', requisiteId] as const,
};

/** Routes under `/payout-trader/*` (balance, notifications, statistics). */
export const specialistCabinetKeys = {
  summary: () => [...payoutTraderRoot, 'summary'] as const,
  settlements: (page: number) => [...payoutTraderRoot, 'settlements', page] as const,
  notifications: () => [...payoutTraderRoot, 'notifications'] as const,
  telegram: () => [...payoutTraderRoot, 'telegram'] as const,
  statistics: (params: unknown) => [...payoutTraderRoot, 'statistics', params] as const,
};

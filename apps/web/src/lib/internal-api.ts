/**
 * Internal (JWT) API URL helpers.
 *
 * The API uses `app.setGlobalPrefix('api')` in Nest. Prefer these helpers over raw
 * `/api/…` literals in UI code so route drift is visible in one place.
 */
export const internalPaths = {
  authLogin: '/api/auth/login',
  authRefresh: '/api/auth/refresh',
  authTwoFaVerify: '/api/auth/2fa/verify',

  adminStats: '/api/admin/stats',
  adminStatistics: '/api/admin/statistics',

  adminCascadeSettings: '/api/admin/cascade/settings',
  adminCascadeMethodPolicy: '/api/admin/cascade/method-policy',
  adminCascadeCoverage: (currency = 'UAH') =>
    `/api/admin/cascade/coverage?currency=${encodeURIComponent(currency)}`,
  adminCascadeNominals: '/api/admin/cascade/nominals',
  adminCascadeNominal: (id: string) => `/api/admin/cascade/nominals/${id}`,
  /** Base path — append query string for filters */
  adminCascadeRequisiteRatingsBase: '/api/admin/cascade/requisite-ratings',
  adminCascadeAssignmentExplain: (currency: string, options?: { amount?: number; detailed?: boolean }) => {
    const params = new URLSearchParams();
    params.set('currency', currency);
    if (
      options?.amount != null &&
      Number.isFinite(options.amount) &&
      options.amount >= 0
    ) {
      params.set('amount', String(options.amount));
    }
    params.set('detailed', options?.detailed === false ? 'false' : 'true');
    return `/api/admin/cascade/assignment-explain?${params.toString()}`;
  },

  adminOrdersStream: '/api/admin/orders/stream',
  adminOrders: (qs: string) => `/api/admin/orders?${qs}`,
  adminOrder: (id: string) => `/api/admin/orders/${id}`,
  adminOrderStatusHistory: (id: string, type: 'PAYIN' | 'PAYOUT') =>
    `/api/admin/orders/${id}/status-history?type=${type}`,
  adminOrderStatus: (id: string) => `/api/admin/orders/${id}/status`,
  /** Staff application logs (charts + unified Pay-In/Pay-Out table); append query string */
  adminOrdersLogs: '/api/admin/application-logs',
  adminOrdersLogsSummary: '/api/admin/application-logs/summary',
  adminOrdersLogsMeta: '/api/admin/application-logs/meta',

  audit: '/api/audit',

  settlements: '/api/settlements',
  settlementsPayoutSpecialistOptions: '/api/settlements/payout-specialist-options',

  traders: '/api/traders',
  trader: (id: string) => `/api/traders/${id}`,
  /** Trader cabinet: full profile (includes Pay-In cascade processing_method) */
  traderMeProfile: '/api/traders/me',
  /** Trader cabinet: own statistics (JWT). Query: period | dateFrom & dateTo */
  traderMeStatistics: '/api/traders/me/statistics',
  /** Trader cabinet: own balances list (JWT) */
  traderMeBalances: '/api/traders/me/balances',
  /** Trader cabinet: analytics (profit, bucketed volumes). Query: filters + granularity + dateBasis */
  traderMeAnalytics: '/api/traders/me/analytics',
  /** Trader: USDT balance, overdraft, operator-assigned monitored deposit addresses (GET) */
  traderUsdtWallet: '/api/trader/dashboard/usdt-wallet',
  /** Trader: SSE — TRC-20 deposit credits (wallet top-ups). */
  traderWalletEventsStream: '/api/trader/dashboard/wallet-events/stream',
  traderBalances: (id: string) => `/api/traders/${id}/balances`,
  traderActivate: (id: string) => `/api/traders/${id}/activate`,
  traderDeactivate: (id: string) => `/api/traders/${id}/deactivate`,
  traderPayoutLimits: (id: string) => `/api/traders/${id}/payout-limits`,
  /** Admin/Owner: Pay-In cascade processing_method and cascade_rating_multiplier */
  traderCascadeRouting: (id: string) => `/api/traders/${id}/cascade-routing`,
  traderBalanceModel: (id: string) => `/api/traders/${id}/balance-model`,
  tradersMeAcceptingOrders: '/api/traders/me/accepting-orders',

  traderDashboardStats: '/api/trader/dashboard/stats',
  traderDashboardRecentOrders: '/api/trader/dashboard/recent-orders',
  traderDashboardPayinAssignRanges: '/api/trader/dashboard/payin-assign-ranges',
  traderDashboardRequisiteRatings: '/api/trader/dashboard/requisite-ratings',

  traderPayinStream: '/api/trader/payin/stream',
  traderPayinOrders: '/api/trader/payin/orders',
  traderPayinOrderStatusHistory: (orderId: string) =>
    `/api/trader/payin/orders/${orderId}/status-history`,
  traderPayinOrderConfirm: (orderId: string) => `/api/trader/payin/orders/${orderId}/confirm`,
  traderPayinOrderCancel: (orderId: string) => `/api/trader/payin/orders/${orderId}/cancel`,
  traderPayinForkVerification: (orderId: string) =>
    `/api/trader/payin/orders/${orderId}/fork-verification`,

  /** Standard trader Pay-Out cabinet REST prefix (JWT). */
  payoutCabinetTrader: '/api/trader/payout',
  traderPayoutOrderStatusHistory: (orderId: string) =>
    `/api/trader/payout/orders/${orderId}/status-history`,
  /** Geo-scoped payout specialist REST + SSE prefix */
  payoutCabinetSpecialist: '/api/payout-trader/payout',
  traderPayoutStream: '/api/trader/payout/stream',
  payoutSpecialistStream: '/api/payout-trader/payout/stream',
  payoutSpecialistSummary: '/api/payout-trader/payout/me/summary',
  payoutSpecialistStatistics: '/api/payout-trader/payout/me/statistics',
  payoutSpecialistNotifications: '/api/payout-trader/payout/me/notifications',
  payoutSpecialistOrderStatusHistory: (orderId: string) =>
    `/api/payout-trader/payout/orders/${orderId}/status-history`,

  adminPlatformExchangeRate: '/api/admin/platform/exchange-rate',
  adminPlatformIncomeSummary: (qs = '') =>
    `/api/admin/platform/income/summary${qs ? `?${qs}` : ''}`,
  adminPlatformIncomeRecent: (qs = '') =>
    `/api/admin/platform/income/recent${qs ? `?${qs}` : ''}`,
  adminPlatformWithdrawals: (qs = '') =>
    `/api/admin/platform/withdrawals${qs ? `?${qs}` : ''}`,
  /** POST body: platform withdrawal audit */
  adminPlatformWithdrawalsPost: '/api/admin/platform/withdrawals',
  adminPlatformWalletDeposits: (qs = '') =>
    `/api/admin/platform/wallet-deposits${qs ? `?${qs}` : ''}`,
  adminPlatformWalletDepositConfirm: '/api/admin/platform/wallet-deposits/confirm',
  adminPlatformOperationsSummary: (qs = '') =>
    `/api/admin/platform/operations/summary${qs ? `?${qs}` : ''}`,

  adminPayoutPoolGlobal: '/api/admin/payout-pool/global',
  adminPayoutPoolMerchants: '/api/admin/payout-pool/merchants',
  adminPayoutPoolMerchantDirectory: (q: string) =>
    `/api/admin/payout-pool/merchants/directory?q=${encodeURIComponent(q)}`,
  adminPayoutPoolMerchantAssignment: '/api/admin/payout-pool/merchants/assignment',
  /** Update or delete a per-merchant Pool B assignment by merchant UUID (`merchant_id`). */
  adminPayoutPoolMerchantAssignmentByMerchant: (merchantId: string) =>
    `/api/admin/payout-pool/merchants/assignment/${merchantId}`,

  payoutAssign: '/api/trader/payout/assign',

  /** Pay-Out specialist — recorded settlements (operator books off-chain USDT payouts) */
  payoutSpecialistSettlements: (qs = '') =>
    `/api/payout-trader/payout/me/settlements${qs ? `?${qs}` : ''}`,

  merchants: '/api/merchants',
  merchant: (id: string) => `/api/merchants/${id}`,
  merchantByUserId: (userId: string) => `/api/merchants/by-user/${userId}`,
  /** Merchant cabinet (JWT) — query: period | dateFrom & dateTo */
  merchantAnalytics: '/api/merchant/analytics',
  /** Merchant ledger — query: page, limit, type?, dateFrom?, dateTo? */
  merchantBalanceTransactions: (qs: string) => `/api/merchant/balance-transactions?${qs}`,
  /** Merchant withdrawals — handbook settlement ledger */
  merchantSettlements: (qs = '') =>
    `/api/merchant/settlements${qs ? `?${qs}` : ''}`,
  /** Merchant period stats — query: dateFrom?, dateTo? */
  merchantBalanceSummary: (qs = '') =>
    `/api/merchant/balance-summary${qs ? `?${qs}` : ''}`,
  merchantBalances: '/api/merchant/balances',
  merchantStats: '/api/merchant/stats',
  merchantDirectionsSelf: '/api/merchant/directions',
  merchantOrders: (qs: string) => `/api/merchant/orders?${qs}`,
  merchantOrdersStream: '/api/merchant/orders/stream',
  merchantWebhooks: (qs: string) => `/api/merchant/webhooks?${qs}`,
  merchantWebhookResend: (webhookId: string) => `/api/merchant/webhooks/${webhookId}/resend`,
  merchantApiKeys: '/api/merchant/api-keys',
  merchantApiKeyRegenerate: (keyId: string) => `/api/merchant/api-keys/${keyId}/regenerate`,
  merchantLock: (id: string) => `/api/merchants/${id}/lock`,
  merchantUnlock: (id: string) => `/api/merchants/${id}/unlock`,

  directions: '/api/directions',
  direction: (id: string) => `/api/directions/${id}`,
  /** Toggle direction online/offline (no body). */
  directionToggle: (id: string) => `/api/directions/${id}/toggle`,

  currencies: '/api/currencies',
  currency: (id: string) => `/api/currencies/${id}`,

  users: '/api/users',
  user: (id: string) => `/api/users/${id}`,
  userPermanentDelete: (id: string) => `/api/users/${id}/permanent`,

  banksAdmin: '/api/banks/admin',
  /** Multipart field name: `file`. Returns `{ id, ... }`. */
  fileUpload: '/api/files/upload',
  fileById: (fileId: string) => `/api/files/${fileId}`,
  fileSignedUrl: (fileId: string) => `/api/files/${fileId}/signed-url`,
  banks: '/api/banks',
  bank: (id: string | number) => `/api/banks/${id}`,
  bankActivate: (id: string | number) => `/api/banks/${id}/activate`,
  bankDeactivate: (id: string | number) => `/api/banks/${id}/deactivate`,

  settlementDetail: (id: string) => `/api/settlements/${id}`,

  // Balance transactions
  balanceTransactions: '/api/trader/balance/transactions',
  adminBalanceTransactions: '/api/admin/balance-transactions',
  adminBalanceAdjust: '/api/admin/balance-transactions/adjust',

  // Platform settings (Owner only write, Admin read)
  platformSettings: '/api/platform-settings',
  platformSetting: (key: string) => `/api/platform-settings/${key}`,

  // Countries & Payment Methods
  countries: '/api/countries',
  adminCountries: '/api/admin/countries',
  adminCountry: (id: string) => `/api/admin/countries/${id}`,
  paymentMethods: '/api/payment-methods',
  paymentMethodsQuery: (qs: string) => `/api/payment-methods?${qs}`,
  countriesQuery: (qs: string) => `/api/countries?${qs}`,
  adminPaymentMethods: '/api/admin/payment-methods',
  adminPaymentMethod: (id: string) => `/api/admin/payment-methods/${id}`,

  // Merchant directions
  merchantDirections: (merchantId: string) => `/api/merchants/${merchantId}/directions`,
  merchantDirection: (merchantId: string, id: string) => `/api/merchants/${merchantId}/directions/${id}`,
  merchantDirectionTiers: (merchantId: string, id: string) => `/api/merchants/${merchantId}/directions/${id}/tiers`,
  merchantDirectionBlockedAmounts: (merchantId: string, directionId: string) =>
    `/api/merchants/${merchantId}/directions/${directionId}/blocked-amounts`,
  merchantDirectionBlockedAmount: (merchantId: string, directionId: string, blockedAmountId: string) =>
    `/api/merchants/${merchantId}/directions/${directionId}/blocked-amounts/${blockedAmountId}`,

  // Referral management (staff: admin & owner) and REFERRAL cabinet
  referrals: '/api/referrals',
  referral: (id: string) => `/api/referrals/${id}`,
  referralLinkUser: (id: string) => `/api/referrals/${id}/link-user`,
  referralUnlinkUser: (userId: string) => `/api/referrals/users/${userId}/unlink`,
  referralMe: '/api/referral/me',
  referralMeStatistics: '/api/referral/me/statistics',

  /** Trader Telegram integration (JWT). */
  telegramSettings: '/api/telegram/settings',
  telegramConnect: '/api/telegram/connect',
  telegramStream: '/api/telegram/stream',
  /** Pay-Out specialist Telegram integration (JWT). */
  payoutTraderTelegramSettings: '/api/telegram/payout-trader/settings',
  payoutTraderTelegramConnect: '/api/telegram/payout-trader/connect',
  payoutTraderTelegramStream: '/api/telegram/payout-trader/stream',

  /** Appeals — GET returns `{ items, total, page, limit }`. */
  appeals: '/api/appeals',
  appealResolve: (appealId: string) => `/api/appeals/${appealId}/resolve`,

  requisiteGroupsMy: (qs: string) => `/api/requisite-groups/my?${qs}`,
  requisiteGroupsMyRoot: '/api/requisite-groups/my',
  requisiteGroupMy: (id: string) => `/api/requisite-groups/my/${id}`,
  requisiteGroupMyRestore: (id: string) => `/api/requisite-groups/my/${id}/restore`,
  requisitesMy: '/api/requisites/my',
  requisite: (id: string) => `/api/requisites/${id}`,
  requisiteActivate: (id: string) => `/api/requisites/${id}/activate`,
  requisiteDeactivate: (id: string) => `/api/requisites/${id}/deactivate`,
  requisiteHistory: (id: string) => `/api/requisites/${id}/history`,

  supportStats: '/api/support/stats',
  supportOrders: (qs: string) => `/api/support/orders?${qs}`,
  supportOrder: (id: string) => `/api/support/orders/${id}`,
  supportOrderStatusHistory: (id: string, type: 'PAYIN' | 'PAYOUT') =>
    `/api/support/orders/${id}/status-history?type=${type}`,
  supportDisputes: (qs: string) => `/api/support/disputes?${qs}`,
  supportDispute: (id: string) => `/api/support/disputes/${id}`,
  supportDisputeNotes: (id: string) => `/api/support/disputes/${id}/notes`,
  supportBalances: (tab: string, qs: string) => `/api/support/balances/${tab}?${qs}`,

  payOrder: (id: string) => `/api/pay/${id}`,
  payOrderConfirm: (orderId: string) => `/api/pay/${orderId}/confirm`,
  payOrderStream: (orderId: string) => `/api/pay/${orderId}/stream`,
} as const;

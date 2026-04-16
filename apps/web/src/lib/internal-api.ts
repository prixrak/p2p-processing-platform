/**
 * Internal (JWT) API URL helpers.
 *
 * The API uses `app.setGlobalPrefix('api')` in Nest. Most resources are exposed as
 * `/api/<controller>` (e.g. `/api/merchants`, `/api/audit`). The `/api/admin/*`
 * prefix exists only for {@link internalPaths.adminStats} (`@Controller('admin')`).
 *
 * Strings under {@link internalPaths.notImplemented} are legacy UI paths: there is
 * no matching Nest route today — keep them here so gaps are visible in one place.
 */
export const internalPaths = {
  adminStats: '/api/admin/stats',
  adminStatistics: '/api/admin/statistics',

  adminOrders: (qs: string) => `/api/admin/orders?${qs}`,
  adminOrder: (id: string) => `/api/admin/orders/${id}`,
  adminOrderStatus: (id: string) => `/api/admin/orders/${id}/status`,

  audit: '/api/audit',

  settlements: '/api/settlements',

  traders: '/api/traders',
  trader: (id: string) => `/api/traders/${id}`,
  traderBalances: (id: string) => `/api/traders/${id}/balances`,
  traderActivate: (id: string) => `/api/traders/${id}/activate`,
  traderDeactivate: (id: string) => `/api/traders/${id}/deactivate`,
  traderPayoutLimits: (id: string) => `/api/traders/${id}/payout-limits`,

  // Pay-Out pool (trader cabinet)
  payoutPool: '/api/trader/payout/pool',
  payoutOrders: '/api/trader/payout/orders',
  payoutAssign: '/api/trader/payout/assign',
  payoutOrderTake: (orderId: string) => `/api/trader/payout/orders/${orderId}/take`,
  payoutOrderProcess: (orderId: string) => `/api/trader/payout/orders/${orderId}/process`,
  payoutOrderComplete: (orderId: string) => `/api/trader/payout/orders/${orderId}/complete`,
  payoutOrderFail: (orderId: string) => `/api/trader/payout/orders/${orderId}/fail`,

  merchants: '/api/merchants',
  merchant: (id: string) => `/api/merchants/${id}`,
  merchantLock: (id: string) => `/api/merchants/${id}/lock`,
  merchantUnlock: (id: string) => `/api/merchants/${id}/unlock`,

  directions: '/api/directions',
  direction: (id: string) => `/api/directions/${id}`,

  currencies: '/api/currencies',
  currency: (id: string) => `/api/currencies/${id}`,

  users: '/api/users',
  user: (id: string) => `/api/users/${id}`,

  banksAdmin: '/api/banks/admin',
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
  adminPaymentMethods: '/api/admin/payment-methods',
  adminPaymentMethod: (id: string) => `/api/admin/payment-methods/${id}`,

  // Merchant directions
  merchantDirections: (merchantId: string) => `/api/merchants/${merchantId}/directions`,
  merchantDirection: (merchantId: string, id: string) => `/api/merchants/${merchantId}/directions/${id}`,
  merchantDirectionTiers: (merchantId: string, id: string) => `/api/merchants/${merchantId}/directions/${id}/tiers`,

  // Referral management (admin) and cabinet
  referrals: '/api/referrals',
  referral: (id: string) => `/api/referrals/${id}`,
  referralLinkUser: (id: string) => `/api/referrals/${id}/link-user`,
  referralUnlinkUser: (userId: string) => `/api/referrals/users/${userId}/unlink`,
  referralMe: '/api/referral/me',
  referralMeStatistics: '/api/referral/me/statistics',

  /**
   * Endpoints not yet implemented on the Nest API.
   * All former stubs (platformStatistics, ordersQuery, order, orderStatus,
   * settlement, bankStatus) have been wired to real routes above.
   */
  notImplemented: {
    orderAssign: (orderId: string) => `/api/admin/orders/${orderId}/assign`,
    merchantConfig: (id: string) => `/api/admin/merchants/${id}/config`,
  },
} as const;

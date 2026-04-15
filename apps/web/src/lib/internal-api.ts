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
  bankDeactivate: (id: string | number) => `/api/banks/${id}/deactivate`,

  // Balance transactions
  balanceTransactions: '/api/trader/balance/transactions',
  adminBalanceTransactions: '/api/admin/balance-transactions',

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
   * Endpoints still referenced by the UI but not implemented (or not at this path)
   * on the Nest API. Prefer implementing or wiring these before relying on them.
   */
  notImplemented: {
    platformStatistics: '/api/admin/statistics',
    ordersQuery: (queryString: string) => `/api/admin/orders?${queryString}`,
    order: (id: string) => `/api/admin/orders/${id}`,
    orderStatus: (id: string) => `/api/admin/orders/${id}/status`,
    orderAssign: (orderId: string) => `/api/admin/orders/${orderId}/assign`,
    settlement: (id: string) => `/api/admin/settlements/${id}`,
    settlementAction: (id: string, action: string) =>
      `/api/admin/settlements/${id}/${action}`,
    /** No matching Nest route — bank toggling uses `PATCH .../deactivate` for off only. */
    bankStatus: (id: string | number) => `/api/admin/banks/${id}`,
    merchantConfig: (id: string) => `/api/admin/merchants/${id}/config`,
  },
} as const;

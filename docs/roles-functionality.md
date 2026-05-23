# Roles & Functionality — Full Reference

> Source: `project_overview.pdf` (v1.0) + `tz_api.pdf` (v1.0), April 2026

---

## 1. Trader

The primary operational participant. Processes incoming and outgoing payment traffic manually through the personal cabinet.

### 1.1 Requisite Management
- Add bank cards and accounts (requisites) for receiving Pay-In orders
- Configure limits per requisite:
  - Maximum total incoming traffic amount
  - Maximum number of transactions
- Auto-disable requisite when any limit is reached
- Edit limits and manually reactivate a disabled requisite
- Manually enable/disable requisites
- Configure amount range (min/max) per requisite
- Set "other banks" flag — whether the requisite accepts transfers from other banks

### 1.2 Pay-In Order Processing
- View incoming orders in real-time (auto-refresh every 5/10/20 seconds)
- Countdown timer per order (green while active, blinking red when expired — visual only, no auto-cancel or reassignment)
- Change order statuses (confirm receipt, cancel, etc.)
- View order requisites and payment details
- Order history

### 1.3 Pay-Out Order Processing
- View incoming payout orders
- Execute transfers to recipient requisites specified by the merchant
- Confirm payout execution
- Payout history

### 1.4 Appeals & Disputes
- View disputed orders
- Work with payment proofs (screenshots, receipts uploaded by payer)
- Make decisions on disputed cases

### 1.5 Statistics
- Personal analytics:
  - Total processed traffic volume
  - Order count (total / successful / cancelled)
  - Conversion rate
- Detailed metrics composition — TBD

### 1.6 Notifications (Telegram Bot)
- Optional Telegram bot integration
- Self-service connection and configuration
- Independent toggle per notification type:
  - New Pay-In orders
  - New Pay-Out orders
  - Appeals / disputes

---

## 2. Administrator

Manages the operational activity of the platform. Full access to all trader data.

### 2.1 Trader Management
- View all trader cabinets — requisites, orders, balances, statistics
- Enable / disable trader cabinets
- Enable / disable individual trader requisites

### 2.2 Order Management
- Manually assign Pay-Out orders to traders
- Intervene in order processing when necessary

### 2.3 Balance Management
- Perform settlements (financial reconciliation with traders)
- Credit and debit amounts on trader balances
- Exact settlement logic — TBD

### 2.4 Platform Statistics
- Total processed traffic volume
- Order count by status (successful, cancelled, in progress)
- Platform conversion and revenue metrics

### 2.5 Audit Log
- Full audit log access (shared with Owner)
- All significant actions are logged: status changes, balance operations, requisite actions, logins, settings changes, webhook requests/responses

### 2.6 Merchant Controls (shared with Owner)
- Configure per-merchant order amount limits (min/max) per direction and currency
- Block specific order amounts from a merchant (exact amount match → order rejected at creation)
- All changes are audit-logged (who, what, when, previous value)

---

## 3. Support

Controls trader operations and assists with resolving operational issues. Dedicated module — exact scope is being finalized.

> Status: functionality is under development. Below is a preliminary list.

### 3.1 Order Monitoring
- View trader orders and their current statuses

### 3.2 Dispute Resolution
- Assist in resolving disputed cases and disputes

### 3.3 Balance Access (Limited)
- View balances
- Possibly make limited corrections (TBD)

### 3.4 Communication
- Communicate with traders and merchants on problem cases

---

## 4. Merchant

Traffic source. Primary interaction is via the External API. Additionally receives a personal cabinet for self-service monitoring.

> Status: cabinet functionality is under development. Below is a baseline list.

### 4.1 External API — Pay-In (9 endpoints)

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `POST /api/external/v1/payin/upload_order` | Create a new Pay-In order |
| 2 | `POST /api/external/v1/payin/update_order` | Update order status (VERIFIED / CANCELED, no files) |
| 3 | `POST /api/external/v1/payin/update_order_with_proofs` | Update order status with payer receipt files (multipart; stored on the order, not as a dispute appeal) |
| 4 | `POST /api/external/v1/payin/order_info` | Get order status/details |
| 5 | `POST /api/external/v1/payin/info` | Get merchant profile & direction parameters |
| 6 | `POST /api/external/v1/payin/h2h_init` | H2H payment initialization (no redirect to payment page) |
| 7 | `POST /api/external/v1/payin/h2h_check_availability` | Pre-check requisite availability for H2H |
| 8 | `POST /api/external/v1/payin/banks` | List available banks for the direction |
| 9 | `POST /api/external/v1/payin/appeal/send` | Submit an appeal with proof files |

### 4.2 External API — Pay-Out (3 endpoints)

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `POST /api/external/v1/payout/order_upload` | Create a new Pay-Out order |
| 2 | `POST /api/external/v1/payout/order_info` | Get Pay-Out order status/details |
| 3 | `POST /api/external/v1/payout/info` | Get merchant profile & direction parameters |

### 4.3 Authentication (API)
- HMAC-SHA512 signed requests (X-API-KEY, X-API-PAYLOAD, X-API-SIGNATURE)
- Separate key pairs for Pay-In and Pay-Out
- Nonce (Unix timestamp) — 5-minute validity window
- Two auth versions: v1 (standard) and v2 (extended, with `api_url` + `nonce` in body)
- Special multipart auth scheme for file-upload endpoints

### 4.3.1 Order Amount Validation (at creation)

Before a Pay-In or Pay-Out order is accepted and assigned to a trader, the platform validates the requested amount against merchant-specific rules configured by Owner/Admin:

| Check | Description | On failure |
|-------|-------------|------------|
| **Min / max limits** | Amount must fall within `minAmount`–`maxAmount` for the active merchant direction (direction + currency) | `4xx` — order not created |
| **Blocked amounts** | Amount must not appear on the merchant's blocked-amount list for that direction + currency | `4xx` — order not created |

Limits and blocked amounts are returned in merchant profile `/info` responses where applicable (TBD — extend `ProfileDto` / `DirectionBalanceDto` or document as admin-only).

### 4.4 Webhook Notifications (inbound to merchant)
- Receive POST callbacks on `callback_url` for every order status change
- Webhook body signed with HMAC-SHA512 (X-Webhook-Signature header)
- Pay-In webhooks signed with Pay-In secret; Pay-Out with Pay-Out secret
- Retry on non-200 responses; dead-letter queue after exhaustion
- Merchant must handle webhooks idempotently
- Event types: `payin_update_status_order`, `payout_update_status_order`

### 4.5 Cabinet — Monitoring & Settings
- Real-time balance monitoring
- Order history and statuses
- Commission percentage and direction settings management
- API key management: generate and regenerate keys for Pay-In and Pay-Out
- Webhook log viewing and manual resend
- Basic traffic analytics (TBD)

### 4.6 Payment Page (generated per Pay-In order)
- Public page at `/pay/{order_uuid}` — no auth required
- Displays trader requisites, amount, currency
- Countdown timer to auto-close
- Optional receipt/screenshot upload (stored on the order for the trader, not as a dispute appeal)
- Redirect to merchant's `redirect_url` after confirmation

---

## 5. Owner (Super-Administrator)

Full unrestricted access to all platform functions. Inherits all Administrator functionality plus the following extras.

### 5.1 All Administrator Functions
- Everything listed in Section 2 (Trader management, Order management, Balance management, Platform statistics, Audit log)

### 5.2 User & Role Management
- Manage roles and permissions for all system users

### 5.3 Merchant Management
- Connect / disconnect merchants
- Configure merchant terms and commissions
- Configure order amount limits and blocked amounts (see §5.3.1–5.3.2)

#### 5.3.1 Order Amount Limits (Min / Max)

Per-merchant limits on order amounts the merchant may submit via the External API. Limits are scoped **per direction and currency** (Pay-In UAH, Pay-Out UAH, etc.) — the same model as `MerchantDirection`.

| Aspect | Rule |
|--------|------|
| **Who can manage** | Owner, Administrator |
| **When to set** | At merchant onboarding (direction setup) and editable later from the merchant management UI |
| **Scope** | `directionType` + `currency` (one row per merchant direction) |
| **Fields** | `minAmount`, `maxAmount` (fiat amount in direction currency) |
| **Zero convention** | `0` = no bound (same as trader requisite limits and existing admin defaults) |
| **Validation point** | External API order creation (`upload_order`, `order_upload`, H2H init) — **before** trader assignment |
| **Out-of-range behavior** | Request rejected with `4xx` (`ErrorDetails`); order is **not** created and no trader is assigned |
| **Applies to** | Pay-In and Pay-Out |
| **Audit** | Create/update of limits must write an audit log entry |

> **Implementation note:** `MerchantDirection.minAmount` / `maxAmount` and `assertOrderAmountWithinActiveMerchantDirection` already enforce this for active directions. Product/UI work: expose min/max on merchant create and edit flows in Owner/Admin cabinets.

#### 5.3.2 Blocked Order Amounts

Allow Owner/Admin to block **specific exact amounts** from a merchant so that any order with that amount is automatically rejected.

| Aspect | Rule |
|--------|------|
| **Who can manage** | Owner, Administrator |
| **Scope** | Per merchant; optionally scoped per `directionType` + `currency` (recommended — same granularity as min/max) |
| **Match rule** | **Exact amount match** in direction currency (e.g. block `300` → every Pay-In UAH order for exactly `300.00` is rejected; `299.99` / `300.01` are not blocked by this rule) |
| **Validation point** | External API order creation — checked **after** auth/signature and **after** min/max validation, **before** trader assignment |
| **Reject behavior** | Order is **not** created (or created only as a failed upload record — TBD); merchant receives `4xx` with a stable `ErrorDetails` code (e.g. `AMOUNT_BLOCKED`) |
| **Applies to** | Pay-In and Pay-Out |
| **UI** | List of blocked amounts per merchant with add / remove; optional note/reason per entry |
| **Audit** | Add/remove blocked amount must write an audit log entry |

**Example:** Merchant sends many fraudulent Pay-In orders for exactly `300 UAH`. Admin adds `300` to the blocked list for Pay-In / UAH. All subsequent `300 UAH` Pay-In uploads from that merchant are rejected immediately.

**Interaction with min/max:** Blocked-amount check runs in addition to min/max — an amount can be within range but still blocked.

### 5.4 Global Platform Settings
- Global financial settings
- Manage directions and currencies via admin panel
- Add, enable, disable currencies and directions

### 5.5 Full Audit Log
- Complete audit log of all actions in the system (who, what, when, previous value)
- Logged events: order status changes, balance operations, requisite actions, logins, settings changes, webhook requests and responses

### 5.6 Security (TBD)
- Additional access protection measures — under development

---

## Appendix A — Order Status Lifecycles

### Pay-In Statuses

| Status | Description |
|--------|-------------|
| `PENDING` | Order created, awaiting trader assignment |
| `NEW` | Assigned to trader, timer started |
| `VERIFIED` | Payer confirmed payment |
| `PAID` | Trader confirmed receipt — order completed |
| `UNDERPAID` | Amount received is less than required |
| `OVERPAID` | Amount received is more than required |
| `APPEAL` | Dispute / appeal opened |
| `CANCELED` | Order cancelled |
| `UPLOAD_FAILED` | Error during order creation |

### Pay-Out Statuses

| Status | Description |
|--------|-------------|
| `PENDING` | Order created, awaiting trader assignment |
| `NEW` | Assigned to trader, queued for processing |
| `PROCESSING` | Trader picked up the order, executing transfer |
| `COMPLETED` | Trader confirmed execution — payout done |
| `FAILED` | Recipient requisite issue — payout failed |
| `UPLOAD_FAILED` | Error during order creation |

---

## Appendix B — Data Models Quick Reference

| Model | Description |
|-------|-------------|
| `OrderDto` | Pay-In order (all Pay-In endpoints) |
| `OrderResponseDto` | OrderDto + `form_uri` (upload_order response) |
| `H2HOrderResponseDto` | OrderDto without `form_uri` (h2h_init response) |
| `AppealDto` | Appeal object inside OrderDto |
| `PaymentDetailsShortDto` | Trader card details inside OrderDto |
| `PayOutOrderApiDto` | Pay-Out order (all Pay-Out endpoints) |
| `DetailsDto` | Recipient requisites for Pay-Out |
| `ProfileDto` | Merchant profile (/info endpoints) |
| `DirectionBalanceDto` | Direction parameters inside ProfileDto |
| `MerchantBlockedAmount` | Blocked exact order amount per merchant direction (TBD) |
| `PayInCheckAvailabilityResponseDto` | H2H availability check result |
| `PaymentBankApiDto` | Bank object (banks endpoint) |
| `WebhookDto` | Webhook notification envelope |
| `WebhookPayinDataDto` | Pay-In data inside WebhookDto |
| `WebhookPayoutDataDto` | Pay-Out data inside WebhookDto |
| `ErrorDetails` | Unified error format (all 4xx/5xx) |

---

## Appendix C — Access Matrix (Summary)

| Capability | Trader | Admin | Support | Merchant | Owner |
|------------|:------:|:-----:|:-------:|:--------:|:-----:|
| Own requisites CRUD | x | | | | |
| Process Pay-In orders | x | | | | |
| Process Pay-Out orders | x | | | | |
| Appeals / disputes (resolve) | x | | x | | |
| Personal statistics | x | | | | |
| Telegram bot notifications | x | | | | |
| View all trader cabinets | | x | x (view) | | x |
| Enable/disable traders | | x | | | x |
| Enable/disable requisites | | x | | | x |
| Assign Pay-Out to traders | | x | | | x |
| Settlements & balance ops | | x | x (limited) | | x |
| Platform-wide statistics | | x | | | x |
| Create orders via API | | | | x | |
| API key management | | | | x | |
| Webhook log + manual resend | | | | x | |
| Merchant cabinet (monitor) | | | | x | |
| Manage users & roles | | | | | x |
| Manage merchants | | x | | | x |
| Merchant min/max & blocked amounts | | x | | | x |
| Global financial settings | | | | | x |
| Manage directions & currencies | | | | | x |
| Full audit log | | x | | | x |

---

## Appendix B — Admin vs Owner web UI (implementation note)

The web app uses **separate routes** (`/admin/*` for `ADMIN`, `/owner/*` for `OWNER`), but the **JWT API** often allows **both roles** for the same actions (e.g. `POST /api/traders/:id/payout-limits`, `POST /api/settlements`). To avoid duplicated behaviour, the following screens share logic:

| Feature | Admin route | Owner route | Shared module (web) |
|---------|-------------|-------------|----------------------|
| Traders (payout pool limits, activate/deactivate, requisite toggles, detail modal) | `/admin/traders` | `/owner/traders` | `@/features/traders` (`PayoutLimitsModal`, `TraderDetailModal`, `staffTraderKeys`) |
| Create settlement | `/admin/settlements` | `/owner/settlements` | `@/features/settlements/settlement-create-modal` |

Other Owner-only areas (users, merchants, directions, banks, global settings) remain under `/owner` only.

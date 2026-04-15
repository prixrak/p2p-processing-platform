# P2P Processing Platform Agent Guide

## Product Context
- Build a single backend with multiple interfaces: merchant external API and role-based internal cabinets.
- Core flows: `Pay-In` and `Pay-Out`, both with strict status lifecycle and webhook notifications.
- API is contract-first and security-first. Preserve backward compatibility for `/api/external/v1/*`.

## Non-Negotiable Domain Rules
- External API requests use `POST` only.
- Auth for external API uses HMAC-SHA512 with `X-API-KEY`, `X-API-PAYLOAD`, `X-API-SIGNATURE`.
- Nonce validity window is 5 minutes; reject expired or invalid signatures.
- `Pay-In` and `Pay-Out` use separate key pairs and separate signing secrets.
- Webhooks are signed and retried on non-200 responses; consumers must be idempotent.
- Status transitions must be validated against an explicit state machine.
- Role-based access must be strictly enforced (trader/admin/support/merchant/owner).
- Critical actions must write audit logs (who, what, when, previous value).

## Engineering Standards
- Keep business logic deterministic and testable; no hidden side effects in controllers.
- **Language**: All code comments (including JSDoc and JSX comments), user-facing UI copy, and API examples in source must be **English**. See `.cursor/rules/english-code-language.mdc`.
- Never hardcode currencies, banks, directions, or payment methods in code.
- Store reference data in DB and expose through admin-managed config.
- Preserve a unified `ErrorDetails` response shape for all 4xx/5xx API errors.

## Definition Of Done For Agent Tasks
- Implement code and tests together.
- Cover auth/security edge cases and negative scenarios.
- Keep API docs/contracts and DTOs synchronized.
- Add/adjust observability: structured logs for status changes and webhook delivery attempts.
- Provide a short risk note when changing statuses, settlement, balances, or retries.

## Explicit Do-Not-Do
- Do not change status enums or endpoint contracts unless explicitly requested.
- Do not bypass signature or nonce checks for convenience.
- Do not mix Pay-In and Pay-Out credentials or webhook secrets.
- Do not introduce schema changes without migrations and compatibility notes.

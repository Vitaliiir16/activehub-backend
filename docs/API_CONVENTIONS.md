# REST contract conventions

Version 0.1.0 defines the intended API surface in [openapi.yaml](openapi.yaml). Only `GET /api/health` is implemented. Every operation carries `x-implementation-status`; all business operations, authorization checks and rules below are planned. Schema validation is not evidence that the business endpoints work. Q-01 through Q-05 remain open in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## Transport and validation

Use JSON request/response bodies, except explicitly declared multipart uploads. IDs are UUIDs. Requests reject unknown fields and enforce role-specific fields even where a shared DTO lists multiple roles' fields. Schema constraints are supplemented by the domain validations in REQUIREMENTS.md: dictionary eligibility, unique email, kind-specific seats, nonoverlapping future sessions, promotion ordering, corporate plan limits, and immutable financial snapshots. GET operations have no side effects. A successful deletion returns 204. Lists return `{ items, meta: { page, pageSize, totalItems, totalPages } }`; empty results have zero total pages.

`page` starts at 1; `pageSize` defaults to 20 and is capped at 100. Each collection declares its allowed sort values; append ID as a stable tie-breaker. Filters combine with AND, reject unknown values, and stay in the frontend URL. Text searches are case-insensitive substrings, except explicitly exact IDs. Omitted city uses the current user's city on the event board; `cityId=all` is the explicit all-cities choice. Skill/age ANY records match every selected skill/age. Full events remain visible unless available-only is requested. Price filters apply to effective event price, before personal benefits. Calendar views consume paginated date-filtered collections and must retrieve every page in the visible interval.

Date-only filters use inclusive `YYYY-MM-DD` boundaries in Europe/Kyiv; compute the exclusive next-day endpoint with timezone-aware calendar arithmetic, including DST. Instants accept RFC 3339 with an explicit offset and return UTC `Z`. PostgreSQL stores instants as timestamptz. The browser formats them in Europe/Kyiv. Timezone choice does not resolve Q-02's quota-month ownership or Q-03's cutoff equality.

Money fields end in `Minor` and use nonnegative integer UAH minor units: 12550 means UAH 125.50. Event prices are at most 10000000 minor units. Aggregate net revenue can be signed. Rates/multipliers use exact decimal strings; never calculate money with binary floating point. Rounding policy belongs in the later pricing implementation and acceptance examples. Subscription and booking prices are immutable snapshots; plan edits do not retroactively rewrite purchases. Card input is transient and write-only; responses expose only last four digits. Never persist/log PAN or CVV, including in request deduplication records.

## Planned authentication and access

Use an opaque random `activehub_session` cookie and a persisted hashed session token with a seven-day default expiry. Set HttpOnly, SameSite=Lax and Path=/; omit Domain. Set Secure in HTTPS deployments; local HTTP development alone disables Secure. Rotate the session on login/registration and invalidate it on logout, blocking or deletion. Password changes require the current password. No bearer token is stored in localStorage. Auth handlers, session storage and revocation are not implemented in this delivery.

Before an unsafe request, call `GET /api/auth/csrf`. It establishes an opaque pre-authentication context if no session exists, with an HTTP-only `activehub_csrf` context cookie, and returns a random token bound server-side to that context/session. Send the token as `X-CSRF-Token`; rotate binding on authentication. Unsafe operations, including login and registration, validate the token in constant time and require an exact configured Origin. Reject cross-site Fetch Metadata; do not rely solely on SameSite. No state-changing GET routes. The same-origin frontend proxy avoids permissive CORS. These safeguards are contract decisions, not current protections on planned routes.

Every protected operation checks active account, role and resource ownership before processing or replaying a request. Foreign-resource IDs return 404. Guest access is limited to health, authentication and active dictionaries needed for registration; catalog and organizer profiles require login. USER accesses own bookings/subscriptions/loyalty. ORGANIZER accesses only owned events/plans/bookings and sees user contacts only for own active or completed bookings. ADMIN cannot read conversations. Administrative profile updates never accept passwords; creation and own password changes are distinct operations. Block/delete revokes sessions. Last-active-admin and self-block protections require transactional checks.

## Errors

Errors use `{ error: { code, message, requestId, fields? } }`, with English messages and optional field-to-message arrays. Every response includes `X-Request-ID`. Return 400 for malformed transport, 401 for no valid session, 403 for denied role/status/CSRF/origin, 404 for missing or foreign resources, 409 for lifecycle/idempotency conflicts, 422 for validation, 429 for throttling, and 503 for temporary unavailability. Do not disclose SQL, secrets, stack traces or account existence in recovery responses. Planned throttling and in-progress deduplication responses also include `Retry-After`.

Implemented readiness returns 200 only after querying PostgreSQL and finding the required migration; it returns 503 on unavailable database/schema. Responses are uncached and carry a generated correlation ID. It is readiness, not a claim that product modules are operational.

## Planned idempotency

Operations marked with a required `Idempotency-Key` take a caller-generated UUID. Persist a record scoped to account, operation and target, with a server-secret HMAC of the canonical validated request, the result and a 24-hour expiry. Sensitive payment input may only contribute to this non-reversible HMAC; never store raw input. Transactionally claim the key before effects. A completed same-key/same-payload request replays the original status/body; different payload returns 409 IDEMPOTENCY_MISMATCH. An in-progress operation returns 409 REQUEST_IN_PROGRESS with Retry-After. Check current access before replay. A new payment attempt after a FAILED result requires a new key; the old key keeps replaying that failure.

Database constraints, financial ledger uniqueness and terminal-state guards must prevent repeated effects even after key expiry. Cancellation releases seats, visits, quota, redeemed points and payments exactly once; it must reverse the original accrual snapshot. This contract does not approve the Q-01 liability model, Q-02 quota ownership, Q-03 equality predicate or Q-04 card eligibility. These operations remain planned until those decisions and their integration tests exist.

## Synchronization

Backend owns OpenAPI and API_CHANGELOG.md. Review changes, implement and validate backend behavior, then update the frontend snapshot and generated types against a full backend commit SHA. The frontend records the SHA-256 of the exact contract bytes. CI checks the checked-in generated client against its snapshot. Paired browser checks call the real API through the frontend proxy; no mocks establish compatibility.

The contract anticipates all mandatory areas and marks optional recovery, session generation, free-only filtering, redemption and the administrator list explicitly. Organizer calendar uses existing session queries. Email jobs and reminders have no public scheduling endpoint. Demo records remain deferred until their business entities exist.

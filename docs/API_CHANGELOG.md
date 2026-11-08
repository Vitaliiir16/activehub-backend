# API change history

## 0.2.0 - 2026-11-08

Implemented stage 04 account registration/login/session/logout, own role-specific profiles, password changes, notification preferences, validated owned images, dictionaries, welcome notification reading and ADMIN-only creation/blocking. Twenty-one route operations now match implemented OpenAPI status; 89 remain planned. Added /api/media/{id} for authenticated owner image reads.

Profile patches use strict schemas chosen from the session role. Administrator display-name edits are supported. Organizer registration omits the former planned logoId: the optional logo is uploaded after automatic sign-in, preserving the created account on upload failure. Dictionary includeSelected=true is authenticated and preserves only the caller's inactive selections. Current login passwords accept 1-256 characters for generic credential checking; new passwords retain the required policy. Added documented 413 errors.

Implemented cookie/CSRF/origin enforcement and persisted rate limits. Registration welcome records and mail outbox are transactional; only welcome delivery is enabled in the worker. Booking/payment/subscription/loyalty/chat operations and optional recovery remain planned. Q-01 through Q-05 remain open.

## 0.1.0 - 2026-11-08

Introduced the OpenAPI foundation for authentication, dictionaries, profiles, discovery, organizer management, bookings, simulated payments, subscriptions, loyalty, messaging, notifications and administration. All business operations are planned; no handler exists for them.

Implemented `GET /api/health` returns a database-aware readiness response with `Cache-Control: no-store` and `X-Request-ID`. Unavailable PostgreSQL or missing migration produces the documented 503 error envelope. This adds `database: ready` to the original scaffold health response.

Defined planned cookie sessions, CSRF/origin checks, access scopes, errors, pagination, filters, integer minor-unit money, UTC instants and idempotency. Q-01 through Q-05 remain unresolved. See [API_CONVENTIONS.md](API_CONVENTIONS.md) for boundaries and synchronization.

Review added cross-event organizer session queries and administrator access to an organizer's aggregate statistics. User cancellation accepts an optional reason; organizer/administrator cancellation still requires one. These are planned contract definitions only.

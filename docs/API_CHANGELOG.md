# API change history

## 0.1.0 - 2026-11-08

Introduced the OpenAPI foundation for authentication, dictionaries, profiles, discovery, organizer management, bookings, simulated payments, subscriptions, loyalty, messaging, notifications and administration. All business operations are planned; no handler exists for them.

Implemented `GET /api/health` returns a database-aware readiness response with `Cache-Control: no-store` and `X-Request-ID`. Unavailable PostgreSQL or missing migration produces the documented 503 error envelope. This adds `database: ready` to the original scaffold health response.

Defined planned cookie sessions, CSRF/origin checks, access scopes, errors, pagination, filters, integer minor-unit money, UTC instants and idempotency. Q-01 through Q-05 remain unresolved. See [API_CONVENTIONS.md](API_CONVENTIONS.md) for boundaries and synchronization.

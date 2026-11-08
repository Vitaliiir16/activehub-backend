# ActiveHub backend

ActiveHub is a sports and active-leisure marketplace. Accounts and access are available: USER/ORGANIZER registration, sign-in, persistent sessions, own profiles and images, preferences, password changes, welcome notifications and ADMIN-only administrator creation/access. Authenticated catalogs, owned event/session/photo management, card/free bookings and simulated payments/refunds are available. Loyalty, chat, reminders and complete reporting remain planned.

## Start

Use Node.js 24 and Docker Desktop with its Linux engine running. Clone [activehub-frontend](https://github.com/Vitaliiir16/activehub-frontend) beside this directory, keeping both repository names. From this directory:

~~~powershell
node scripts/create-local-env.mjs
docker compose up --build --wait
~~~

Environment generation is needed once and refuses to overwrite an existing file. Review the generated .env privately for the initial administrator email/password/name. Alternatively copy .env.example and replace password placeholders. Existing bootstrap credentials are preserved on restart; changing environment values does not reset them.

Open the frontend at http://localhost:8080, readiness at http://localhost:3000/api/health, and Mailpit at http://localhost:8025. Register a user or organizer, or sign in using the configured administrator. There are no demo accounts/events. UI, validation and seed labels are English. UAH and Europe/Kyiv remain the product conventions.

Compose waits for PostgreSQL, runs checked migrations and idempotent required seeds, then starts API/worker and frontend. Named volumes retain database records, profile images and captured mail. Repeat the same startup command to apply new migrations without deleting data. Stop with docker compose stop; docker compose down retains volumes. Do not remove volumes to reset configuration. PostgreSQL 18 stores data at /var/lib/postgresql.

## Account security

Passwords use the existing salted scrypt configuration. Opaque session and CSRF context cookies are HTTP-only, SameSite=Lax and scoped to /. Session tokens are stored as digests, expire after seven days by default and are revoked on logout/block/deletion. Password changes verify the current password and rotate the current session while revoking other sessions.

Every unsafe account operation requires a context/session-bound CSRF token and an exact configured Origin. The frontend fetches tokens and serializes mutations. All HTTPS origins enable Secure cookies; HTTP cookies are allowed only for localhost development. DTOs reject role/owner/status injection. Profiles derive their owner from the session. Inactive dictionary values remain visible on the owner's existing profile but cannot become new selections. Owned images are decoded, resized and stripped of metadata before WebP storage; arbitrary uploads and foreign reads are denied.

Only ADMIN can create another administrator or update another administrator's status. Self-block and last-active-administrator removal are protected by serialized checks. Administrator deletion, dedicated listing and general management remain planned. Registration welcome records and email outbox entries are transactional. The separate worker currently delivers only welcome email to Mailpit, persists retries, skips completed records and shuts down cleanly. SMTP acceptance followed by a process crash before database commit can produce a duplicate external email; external exactly-once delivery is not claimed.

## Configuration

| Variable | Purpose |
|---|---|
| COMPOSE_PROJECT_NAME | Container/volume namespace; default activehub |
| POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD | Database bootstrap; changes do not rewrite an existing volume |
| INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD / INITIAL_ADMIN_NAME | Required first-administrator configuration; never published or reset on reseed |
| API_PORT / FRONTEND_PORT / MAILPIT_PORT | Localhost ports; defaults 3000 / 8080 / 8025 |
| APP_ORIGINS | Exact comma-separated browser origins; Compose defaults to localhost and 127.0.0.1 at FRONTEND_PORT |
| SESSION_TTL_SECONDS | Default 604800; supported range 60-2592000 |
| DATABASE_URL or PG* | Database connection for local commands outside Compose |
| UPLOAD_DIR | Shared image directory; /app/uploads in Compose; set an absolute writable directory for local Next.js development |
| SMTP_HOST / SMTP_PORT | Development mail capture; mailpit:1025 in Compose |

When using Vite development, configure APP_ORIGINS to include the exact http://localhost:5173 or http://127.0.0.1:5173 origin in addition to any Compose frontend origin. No wildcard CORS is enabled. Secrets never belong in frontend environment variables.

## Checks

~~~powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run contract:check
npm.cmd run build
~~~

PowerShell uses npm.cmd/npx.cmd; other shells use npm/npx. The health and contract scripts call a running API. test:smoke starts the built server on port 3100 and needs real PostgreSQL variables. test:marketplace runs the catalog/booking/payment risk suite on an isolated database with ACTIVEHUB_TEST_WRITES=true. It checks concurrency and once-only refunds. test:accounts additionally needs an isolated initialized database, local SMTP/Mailpit and ACTIVEHUB_TEST_WRITES=true. It writes identifiable fixtures and temporarily changes test dictionary flags; use it only on an isolated test stack. [ACCOUNTS_REVIEW.md](docs/ACCOUNTS_REVIEW.md) gives reproducible commands and manual checks. db:verify rolls back its probe mutations and verifies idempotent seeds and migration checksums.

GitHub Actions runs PostgreSQL and Mailpit services, static checks, bootstrap checks and the real production-server account suite. Frontend CI checks out its pinned backend revision and runs the full Compose/browser flows without mocks. Dependency versions and image digests are pinned; npm audits reported zero vulnerabilities at verification time.

## Documentation

- [Requirements](docs/REQUIREMENTS.md), [matrix](docs/REQUIREMENTS_MATRIX.md), [delivery plan](docs/DELIVERY_PLAN.md) and [progress](docs/PROGRESS.md)
- [OpenAPI](docs/openapi.yaml), [conventions](docs/API_CONVENTIONS.md), [changelog](docs/API_CHANGELOG.md) and [account acceptance](docs/ACCOUNTS_ACCEPTANCE.md)
- [Architecture](docs/ARCHITECTURE.md), [models](docs/MODELING.md) and [open decisions](docs/ASSUMPTIONS.md)

OpenAPI 0.4.0 includes the stage 08 subscription operations. Q-03 is approved as an inclusive cutoff; Q-01/Q-02/Q-04/Q-05 remain open. Persisted booking expiry/completion runs in the worker. Subscription/loyalty benefits, reminders and optional recovery remain planned. This delivery stops after stage 07. See [marketplace review](docs/MARKETPLACE_REVIEW.md) for manual checks and test limits.

## Implemented design patterns

| Pattern | Purpose | Source and search |
|---|---|---|
| Adapter | Map the welcome-mail port to local SMTP while keeping delivery details outside account registration | [welcome-mail.ts](src/infrastructure/welcome-mail.ts): WelcomeMail, MailpitWelcomeMail; search: `rg -n WelcomeMail src` |
| Strategy | Select ordinary/team/exclusive-hall seat rules without branching across booking orchestration | [policies.ts](src/modules/marketplace/policies.ts): SeatPolicy, seatPolicy; search: `rg -n SeatPolicy src` |
| Adapter | Isolate card simulation behind the payment port | [payment-gateway.ts](src/modules/marketplace/payment-gateway.ts): PaymentGateway, SimulatedCardGateway; search: `rg -n SimulatedCardGateway src` |

Other GoF collaborations in the architecture and UML remain proposed. The profile/session functions are not presented as invented pattern implementations.

## Subscriptions

Organizer Plans and My subscriptions are available. Purchases preserve price, duration, visits and scope; plan edits/archive affect future purchases only. Subscription bookings consume one visit per place and return visits once on reject/cancel/expiry. Subscription purchases are non-refundable. Apply migration 007 with `docker compose up --build --wait`; existing data is retained. Corporate loyalty remains stage 09.

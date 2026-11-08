# ActiveHub backend

ActiveHub is a sports and active-leisure marketplace. Accounts and access are available: USER/ORGANIZER registration, sign-in, persistent sessions, own profiles and images, preferences, password changes, welcome notifications and ADMIN-only administrator creation/access. Authenticated catalogs, owned event/session/photo management, card/free bookings and simulated payments/refunds are available. Subscriptions, loyalty cards, points, free visits and administrator loyalty settings are available. Every notification appears in the site and is also emailed according to the user's preferences; reminders and user-organizer chat are available. Administrators manage users, organizers, events, bookings, subscriptions and dictionaries. Platform statistics and reporting remain planned.

## Start

Use Node.js 24 and Docker Desktop with its Linux engine running. Clone [activehub-frontend](https://github.com/Vitaliiir16/activehub-frontend) beside this directory, keeping both repository names. From this directory:

~~~powershell
node scripts/create-local-env.mjs
docker compose up --build --wait
~~~

Environment generation is needed once and refuses to overwrite an existing file. Review the generated .env privately for the initial administrator email/password/name. Alternatively copy .env.example and replace password placeholders. Existing bootstrap credentials are preserved on restart; changing environment values does not reset them.

Open the frontend at http://localhost:8080, readiness at http://localhost:3000/api/health, and Mailpit at http://localhost:8025 (by default every email is captured there and nothing leaves your machine; see Email to send real mail). Register a user or organizer, or sign in using the configured administrator. There are no demo accounts/events. UI, validation and seed labels are English. UAH and Europe/Kyiv remain the product conventions.

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
| SMTP_HOST / SMTP_PORT | Mail server; defaults to the Mailpit capture service (mailpit:1025). See Email for a real provider |
| SMTP_USER / SMTP_PASSWORD / SMTP_FROM / SMTP_FROM_NAME / SMTP_SECURE / SMTP_REQUIRE_TLS | Authentication, sender and TLS for a real provider; leave empty for Mailpit |
| APP_PUBLIC_URL | Public address used in email links; defaults to http://localhost:FRONTEND_PORT |
| EMAIL_MAX_ATTEMPTS | Delivery attempts before an email is marked failed; default 50 |
| REMINDER_FIRST_SECONDS / REMINDER_SECOND_SECONDS / REMINDER_WORKER_INTERVAL_SECONDS | Reminder lead times (24 h, 2 h) and job interval (60 s) |

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

PowerShell uses npm.cmd/npx.cmd; other shells use npm/npx. The health and contract scripts call a running API. test:smoke starts the built server on port 3100 and needs real PostgreSQL variables. test:marketplace runs the catalog/booking/payment risk suite on an isolated database with ACTIVEHUB_TEST_WRITES=true. It checks concurrency and once-only refunds. test:loyalty runs the awards/quota/card risk suite the same way. It temporarily changes loyalty settings and restores them, and needs the administrator variables and a superuser database role to simulate subscription expiry. test:communications runs the notification table, reminder, email delivery and chat suite against the real API, database and Mailpit (set MAILPIT_BASE_URL and SMTP_HOST/SMTP_PORT). test:administration runs the administrator search, cascade, race and dictionary suite the same way; like test:communications it dispatches mail itself, so stop the worker first. mail:check verifies the configured mail server and can send one test email. test:accounts additionally needs an isolated initialized database, local SMTP/Mailpit and ACTIVEHUB_TEST_WRITES=true. It writes identifiable fixtures and temporarily changes test dictionary flags; use it only on an isolated test stack. [ACCOUNTS_REVIEW.md](docs/ACCOUNTS_REVIEW.md) gives reproducible commands and manual checks. db:verify rolls back its probe mutations and verifies idempotent seeds and migration checksums.

GitHub Actions runs PostgreSQL and Mailpit services, static checks, bootstrap checks and the real production-server account suite. Frontend CI checks out its pinned backend revision and runs the full Compose/browser flows without mocks. Dependency versions and image digests are pinned; npm audits reported zero vulnerabilities at verification time.

## Documentation

- [Requirements](docs/REQUIREMENTS.md), [matrix](docs/REQUIREMENTS_MATRIX.md), [delivery plan](docs/DELIVERY_PLAN.md) and [progress](docs/PROGRESS.md)
- [OpenAPI](docs/openapi.yaml), [conventions](docs/API_CONVENTIONS.md), [changelog](docs/API_CHANGELOG.md) and [account acceptance](docs/ACCOUNTS_ACCEPTANCE.md)
- [Architecture](docs/ARCHITECTURE.md), [models](docs/MODELING.md) and [open decisions](docs/ASSUMPTIONS.md)

OpenAPI 0.7.0 includes the stage 11 administration operations. Q-01/Q-02/Q-03/Q-04 are approved (see open decisions); Q-05 remains open. Booking expiry/completion, hourly subscription expiry, reminders and email delivery run in the worker. Statistics, reporting and optional recovery remain planned. This delivery stops after stage 11. See the [marketplace](docs/MARKETPLACE_REVIEW.md), [communications](docs/COMMUNICATIONS_REVIEW.md) and [administration](docs/ADMINISTRATION_REVIEW.md) reviews for manual checks and test limits.

## Implemented design patterns

| Pattern | Purpose | Source and search |
|---|---|---|
| Adapter | Map the mail port to an SMTP server (Mailpit locally, Gmail or another provider in production) so notifications and the dispatcher never touch transport details | [mail.ts](src/infrastructure/mail.ts): MailTransport, SmtpMailTransport; search: `rg -n MailTransport src` |
| Strategy | Select ordinary/team/exclusive-hall seat rules without branching across booking orchestration | [policies.ts](src/modules/marketplace/policies.ts): SeatPolicy, seatPolicy; search: `rg -n SeatPolicy src` |
| Chain of Responsibility | Apply promotion, card free access and card discount in the fixed source order, recording each modifier | [pricing.ts](src/modules/loyalty/pricing.ts): PriceStep, PromotionStep, FreeAccessStep, CardDiscountStep; search: `rg -n PriceStep src` |
| Adapter | Isolate card simulation behind the payment port | [payment-gateway.ts](src/modules/marketplace/payment-gateway.ts): PaymentGateway, SimulatedCardGateway; search: `rg -n SimulatedCardGateway src` |

Other GoF collaborations in the architecture and UML remain proposed. The profile/session functions are not presented as invented pattern implementations.

## Subscriptions

Organizer Plans and My subscriptions are available. Purchases preserve price, duration, visits and scope; plan edits/archive affect future purchases only. Subscription bookings consume one visit per place and return visits once on reject/cancel/expiry. Subscription purchases are non-refundable. Apply migration 007 with `docker compose up --build --wait`; existing data is retained.

## Loyalty

Bookings are priced by the member card: promotion, free visits for the card's directions (session month in Europe/Kyiv), then the card discount. Confirmed bookings earn points once, including free and subscription bookings; cancellation reverses the recorded award once, never below a zero balance. Premium follows lifetime points; Corporate follows an unexpired corporate subscription. Administrators configure levels and rules, assign or lock cards and adjust points with a reason. Migration 008 applies through the same startup command without resetting data.

## Email

Every notification is shown in the site and, when its category allows, also emailed. Booking, payment, subscription, cancellation, refund, change and administrator messages are always emailed. Reminders and offers are emailed by default, and each can be turned off in the profile. Points and chat messages are emailed only if the user turns them on; card upgrade emails are sent until the user changes the points setting. The worker sends queued emails with retries and never sends one twice.

By default all email goes to Mailpit at http://localhost:8025, so nothing reaches real recipients while developing. To send real email, add these lines to the backend `.env` and restart with `docker compose up --build --wait`. Gmail example:

~~~
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.address@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM=your.address@gmail.com
APP_PUBLIC_URL=https://your-site.example
~~~

Gmail requires 2-Step Verification and an app password (Google account, Security, App passwords); the normal account password does not work. Port 587 uses STARTTLS; port 465 with `SMTP_SECURE=true` uses implicit TLS. Gmail sends from your own address. Other providers use the same variables. The password is read only from the environment and is never logged or stored in the database.

Check the settings without registering anyone, from the backend directory (the worker container already has the variables):

~~~powershell
docker compose run --rm --no-deps worker node --import tsx scripts/check-mail.ts you@example.com
~~~

Without Docker, run `node --env-file=.env --import tsx scripts/check-mail.ts you@example.com`. The worker log shows `Email: smtp.gmail.com:587 (STARTTLS, authenticated)` at start. A failed message stays queued and is retried with growing delays; a rejected recipient is marked failed. `APP_PUBLIC_URL` must be the address users open, because email links use it.

## Chat

A user starts a conversation from an organizer or activity page; an organizer starts one from a booking of that member. Each user-organizer pair has one conversation. Messages are text (up to 2000 characters), may carry an activity card and show sent/read state. The header shows unread messages and notifications and the pages update by polling every few seconds, with no manual reload. Administrators cannot read or send messages, blocked accounts cannot send, and sending is limited to 30 messages per minute.

## Administration

Sign in as the administrator from `.env` (the first administrator is created from the environment). The Administration area has Users, Organizers, Events, Bookings, Subscriptions, Dictionaries, Loyalty settings and Administrator access. Every list is paginated, sortable and filtered through the address, so a search can be shared. Deleted accounts stay searchable.

- **Block** ends every session and prevents sign-in; existing bookings are kept. Blocking an organizer also hides its events, page and plans and stops new bookings, while existing bookings continue.
- **Delete** is soft. Deleting a user cancels, refunds and compensates every active booking (places, visits, points) and notifies organizers. Deleting an organizer cancels and refunds events that have a future session or an active booking, archives its plans and notifies members. Payments, bookings, points and chats remain as history, and repeating a request changes nothing.
- **Edit contacts** never changes passwords. Organizers are told by notification and email about edits, blocks and deletion.
- **Events** can be searched in every status, edited (text), moderated (photos removed), blocked, cancelled or deleted; **bookings** can be cancelled with a refund.
- **Dictionaries**: add, rename and deactivate cities and directions. Existing references keep working, new selections need an active value, and one value always stays active.
- Every administrator decision is stored with its reason in an append-only audit log in the database.

Platform statistics and the optional dedicated administrator list (Q-05) are not part of this stage.

## Statistics

Administrators open Statistics for 7, 30 or 90 days or a custom Europe/Kyiv range (at most one year). Totals, breakdowns and charts count records created in the period; net payments are successful card payments minus refunds; booking conversion is the share of created bookings that were ever confirmed. Organizers see their own dashboard (counters, net current-month revenue, unread messages and a 30-day chart). Recommendations without preferences rank city activities by live and completed bookings. The rules are in docs/ASSUMPTIONS.md (Stage 12).

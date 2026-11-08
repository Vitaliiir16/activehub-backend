# ActiveHub

ActiveHub connects members with trainers, clubs, venues and activity organizers. Members discover activities, reserve places, use subscriptions and loyalty benefits, pay through a card simulator and communicate with organizers. Organizers manage activities, sessions, requests and plans. Administrators manage accounts, content, reference data, loyalty settings and statistics.

The backend is a TypeScript REST API built with Node.js 24 and Next.js 16. The separate frontend uses React 19, TypeScript and Vite. PostgreSQL owns transactional state; a separate worker handles deadlines, reminders and email. The interface is English, money is UAH and displayed time is Europe/Kyiv.

## Run the application

Install Node.js 24 and Docker Desktop with the Linux engine running. Keep the two repositories beside each other:

~~~powershell
git clone https://github.com/Vitaliiir16/activehub-backend.git
git clone https://github.com/Vitaliiir16/activehub-frontend.git
cd activehub-backend
node scripts/create-local-env.mjs
docker compose up --build --wait
~~~

Generate .env once. The generator preserves an existing file and writes random local database, initial-administrator and demo passwords into a new file. Keep it private. Alternatively copy .env.example and fill its required credentials.

| Service | Default address |
|---|---|
| Frontend | http://localhost:8080 |
| API readiness | http://localhost:3000/api/health |
| Mailpit | http://localhost:8025 |

Compose waits for PostgreSQL, applies checksum-checked migrations and required seeds, then starts API, worker and frontend. The initializer shares the uploads volume for demo images. Repeat the same command to upgrade without deleting data. Stop with docker compose stop. Database, uploads and captured mail use named volumes; keep them when restarting. The frontend proxies /api to the real backend on the same origin.

To run only migrations and seeds against this Compose database, use `docker compose run --rm migrate`. Normal startup already performs this step; do not run it with another environment file unless that database is intended.

## Sign in and demonstrate

The initial ADMIN uses INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD from the private .env. Existing administrator credentials are preserved on reseed; changing environment values does not reset an account. Members and organizers can register themselves; administrators cannot self-register.

To enable the demonstration dataset, set these keys in .env and repeat the startup command:

~~~dotenv
SEED_DEMO=true
DEMO_NAMESPACE=demo
~~~

DEMO_PASSWORD must be explicitly configured: the generator supplies a random value in new environments. For an older environment, choose a private password with 8-256 characters including a letter and digit. The same configured password applies to newly seeded demo accounts; it is never printed or published.

| Role | Email with the default namespace |
|---|---|
| Members | member1@demo.activehub.example.test through member4@demo.activehub.example.test |
| Trainer | trainer@demo.activehub.example.test |
| Club | club@demo.activehub.example.test |
| Venue | venue@demo.activehub.example.test |
| Organizer | organizer@demo.activehub.example.test |
| Administrator | INITIAL_ADMIN_EMAIL from .env |

The dataset includes four members, all organizer types, 12 activities with future sessions, covers and a promotion, all plan types, paid/free/subscription and historical bookings, loyalty ledgers, a conversation and notifications. Dates are relative to the first seed of a namespace. Repeating startup preserves records, edits, credentials and settings. To create a fresh cohort later, choose a new lowercase DEMO_NAMESPACE; the old cohort remains. If a reserved demo email already exists without its marker, seeding refuses to replace it. Demo mode is off by default and does not reset an existing installation.

The teaching sequence and exact acceptance evidence are in [FINAL_ACCEPTANCE.md](docs/FINAL_ACCEPTANCE.md).

## Environment and email

| Variables | Purpose |
|---|---|
| POSTGRES_PASSWORD; INITIAL_ADMIN_EMAIL / PASSWORD / NAME | Required private database and first-administrator configuration |
| API_PORT / FRONTEND_PORT / MAILPIT_PORT | Host ports, default 3000 / 8080 / 8025 |
| APP_ORIGINS / APP_PUBLIC_URL | Exact accepted browser origins and absolute links in email |
| SESSION_TTL_SECONDS | Session lifetime, default seven days |
| BOOKING_CUTOFF_SECONDS / CANCELLATION_CUTOFF_SECONDS | Inclusive booking boundary and confirmed-cancellation window; defaults 1800 / 43200 |
| PAYMENT_DEADLINE_SECONDS / PENDING_DEADLINE_SECONDS | Default 3600 / 172800, capped at the session start |
| BOOKING_WORKER_INTERVAL_SECONDS / REMINDER_WORKER_INTERVAL_SECONDS | Persistent job cadence, default 60 seconds |
| REMINDER_FIRST_SECONDS / REMINDER_SECOND_SECONDS | Default 24 hours / 2 hours |
| MAX_EVENT_PHOTOS / MAX_EVENT_SESSIONS / MAX_UPLOAD_BYTES | Defaults 8 / 60 / 5242880; may be lowered within specification safety bounds |
| UPLOAD_DIR; DATABASE_URL or PG* | Local development storage and database connection; Compose supplies these internally |
| SEED_DEMO / DEMO_PASSWORD / DEMO_NAMESPACE | Explicit, idempotent demonstration cohort |

List page sizes can be selected per API request, up to 100. Administrators configure loyalty thresholds, multipliers, discounts, free directions and rules in the application.

Mailpit is the default SMTP destination: captured messages stay local. To use Gmail or another provider, explicitly configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in the private .env. Gmail normally uses smtp.gmail.com:587, SMTP_SECURE=false and SMTP_REQUIRE_TLS=true with an app password. Port 465 uses SMTP_SECURE=true. Keep SMTP_TLS_REJECT_UNAUTHORIZED=true for provider certificate checks. APP_PUBLIC_URL must be the browser address for email links. SMTP_FROM_NAME and EMAIL_MAX_ATTEMPTS customize sender display and bounded retries. Run npm.cmd run mail:check with the intended SMTP environment to diagnose configuration; credentials are redacted.

For Vite development, run the frontend dev command and include its exact origin in APP_ORIGINS; configure API_PROXY_TARGET in the frontend when the API uses another port. Never put secrets in browser environment values.

## Checks

~~~powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run contract:check
npm.cmd run build
npm.cmd test
~~~

db:verify checks required seeds and migration checksums with probe changes rolled back. Real API/PostgreSQL risk suites are test:accounts, test:marketplace, test:loyalty, test:communications, test:administration and test:statistics. They require an initialized isolated database, SMTP/Mailpit and ACTIVEHUB_TEST_WRITES=true; they write synthetic fixtures. Run only the suites relevant to a change. Existing CI runs the full configured checks; frontend CI checks out its pinned backend and compares the canonical contract.

## Implemented patterns

| Pattern | Purpose and real source | Find it |
|---|---|---|
| Strategy | SeatPolicy and seatPolicy select ordinary places, a single participant or an exclusive hall in src/modules/marketplace/policies.ts | rg -n SeatPolicy src |
| Chain of Responsibility | PriceStep, PromotionStep, FreeAccessStep and CardDiscountStep preserve pricing order and record the breakdown in src/modules/loyalty/pricing.ts | rg -n 'class.*Step' src/modules/loyalty/pricing.ts |
| Adapter | PaymentGateway / SimulatedCardGateway map the card simulator to the payment port in src/modules/marketplace/payment-gateway.ts | rg -n SimulatedCardGateway src |
| Adapter | MailTransport / SmtpMailTransport isolate SMTP and error translation in src/infrastructure/mail.ts | rg -n SmtpMailTransport src |

The UML [class model](docs/diagrams/classes.svg), [Use Cases](docs/diagrams/use-cases.svg), [booking collaboration](docs/diagrams/booking-patterns.svg) and [architecture](docs/ARCHITECTURE.md) distinguish real function modules, types and database records. SOLID/GRASP examples link actual symbols. Booking validation tables and the outbox are not claimed as GoF State or Observer implementations.

## Limits and project records

Payments are simulated; card numbers and CVV are never persisted. Development defaults capture mail. SMTP delivery retains a possible acceptance/commit crash window; universal exactly-once external email is not claimed. Password recovery, schedule generation, organizer-wide calendar, redemption, near-expiry notices, an explicit free-only switch and a dedicated administrator list remain optional and unavailable.

See [requirements](docs/REQUIREMENTS.md), [matrix](docs/REQUIREMENTS_MATRIX.md), [decisions](docs/ASSUMPTIONS.md), [OpenAPI](docs/openapi.yaml), [API changes](docs/API_CHANGELOG.md) and [acceptance](docs/FINAL_ACCEPTANCE.md). All five original questions have recorded owner decisions. Stage 13 stops before optional stage 14.

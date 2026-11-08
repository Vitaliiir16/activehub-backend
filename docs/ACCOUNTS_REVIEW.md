# Accounts manual review

Start both sibling repositories using the backend README. All commands below run from the backend directory unless stated otherwise. The existing database and profile-image volumes survive upgrades and restarts. No optional recovery or general administration screens are part of this delivery.

## Check the interface

1. Open http://localhost:8080. Choose Create an account, then Find an activity. Complete the USER form; try mismatched passwords first. Correct them and create the account. Confirm automatic navigation to the activity-board placeholder.
2. Open Profile. Change name, email, city and preferred directions. Save, reload and confirm the values. Upload a JPEG/PNG/WebP photo up to 5 MiB; try an invalid or oversized file. Save email preferences and reload. In-app and booking email cannot be disabled.
3. Change the password using the current password. A wrong current password must fail. Sign out, reload and confirm that the profile requires sign-in. Sign in using the updated email/password. A wrong password must produce the same credential error as an unknown email.
4. Repeat registration using Offer activities. Select the provider type, city, at least one direction and contact phone. The optional logo uploads immediately after automatic sign-in; if upload fails, the account remains created and profile offers retry. Confirm organizer navigation, profile/logo edits and reload.
5. Open Notifications for either new account. Confirm one welcome notification and mark it read. In Mailpit at http://localhost:8025, find one welcome email for that registration. No password appears in the message.
6. Sign out. Privately read the initial administrator credentials from the backend .env and sign in. Open Administrator access, create another administrator, sign out and sign in as the new administrator. Return to the first administrator to block/unblock the new account using its returned account ID. Blocking yourself must fail. The optional administrator list and administrator deletion are unavailable.
7. Check at phone and desktop widths. Role start pages describe forthcoming features without invented counts. USER/ORGANIZER must be redirected away from administrator pages, and direct API requests must also be denied.

## Isolated automated acceptance

The account suite creates fixtures and temporarily deactivates dictionary entries. Use a dedicated test project, never a database containing real users. The environment generator refuses to overwrite an existing file. Choose unused ports if these are occupied:

```powershell
$env:COMPOSE_PROJECT_NAME='activehub-accounts-test'
$env:API_PORT='3500'
$env:FRONTEND_PORT='8380'
$env:MAILPIT_PORT='8325'
node scripts/create-local-env.mjs .env.verify
docker compose --env-file .env.verify -p activehub-accounts-test up --build --wait
docker compose --env-file .env.verify -p activehub-accounts-test run --rm --no-deps -e ACTIVEHUB_TEST_WRITES=true -e API_BASE_URL=http://api:3000 migrate node --import tsx scripts/verify-accounts.ts
docker compose --env-file .env.verify -p activehub-accounts-test run --rm --no-deps migrate node --import tsx scripts/verify-db.ts
```

From the frontend directory:

```powershell
$env:ACTIVEHUB_E2E_ENV_FILE='../activehub-backend/.env.verify'
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The runner privately loads the two administrator credentials and port settings; it never prints them. API tests cover concurrent cross-role email uniqueness, role/owner injection, guest/role/foreign-image/notification denial, CSRF/origin, expiry/logout/block/deletion, password changes, image formats/sizes, inactive selections and welcome deduplication. Eight browser tests cover both roles and seeded/new ADMIN at desktop/mobile sizes, with real Mailpit queries.

GitHub Actions runs the same backend suite using test:accounts, which starts a built production server with isolated PostgreSQL and Mailpit services and checks captured logs for credential leakage. Its required connection/SMTP/test variables are explicit in the workflow. test:smoke remains the smaller health/schema check.

## Delivery boundaries

The welcome outbox uses transactional row claims and persisted retry timestamps. Normal replay, concurrent processing, worker restart and recovery from SMTP unavailability preserve one logical notification/outbox result. A crash after SMTP accepts a message but before PostgreSQL commits can still repeat external delivery; a stable Message-ID supports investigation. No exactly-once SMTP guarantee is claimed.

Business routes, communication triggers beyond welcome, demo records, optional password recovery and the optional administrator list remain planned. Q-01 through Q-05 remain unresolved.

# Delivery progress

## Stage 12 - current delivery

Snapshot: 2026-11-08, Europe/Kyiv. Both PRs #8 (stage 11) were verified merged: backend main c55e9b5, frontend main 7734395. Both repositories branched feature/12-statistics from those heads. No merge, history rewrite or force push was performed.

Implemented: administrator platform statistics for 7, 30 and 90 days and custom Kyiv ranges (totals, exact booking conversion, net payments, day and category breakdowns, top ten activities, registrations and member breakdowns); organizer dashboard (counters, net current-month revenue, unread messages, 30-day chart, own data only) and the administrator view of an organizer; recommendations without preferences rank by live and completed bookings only. OpenAPI 0.8.0 has 112 operations, 108 implemented. No migration. Frontend: statistics screen with URL-backed period filters, accessible SVG column and bar charts with hover values and data tables, organizer dashboard, figures on administrator organizer pages. Not implemented: the organizer's proposal and availability lists (existing screens) and a mobile browser test of the statistics screens.

### Verification observed

- Backend lint, typecheck and production build passed. Unit tests: 22 passed (6 new statistics tests for Kyiv periods, custom range validation, month windows, exact ratios, zero-filled buckets and labels).
- Isolated stack activehub-stats-check (ignored .env.stats; UI 8880, API 4000, Mailpit 8825, PostgreSQL 127.0.0.1:5610, SMTP 127.0.0.1:1030) applied migrations to 010. Through the CI-style harness db:verify, test:accounts, test:marketplace, test:loyalty, test:communications, test:administration and the new test:statistics passed.
- scripts/verify-statistics.mjs: platform deltas for seven bookings, net payments of 25 000 kopiykas after one refund, status and day buckets, a top-event count of four, conversion matching an SQL check; exact organizer dashboard counters (3 activities, 2 active, 1 paused, 3 future sessions, 4 active bookings, 1 pending request, 20 000 kopiykas net month revenue, 1 unread message, 6 bookings today); isolation from another organizer; administrator view identical to the organizer's; access denials, ownership 404s and period validation; recommendation order with live versus cancelled bookings.
- Frontend lint, typecheck, build and api:check passed. Playwright against the same stack: 13 passed, 5 skipped (mobile duplicates of desktop-only workflows). The statistics test checks that the organizer dashboard counts a new activity, the administrator period filter with its data table, and the organizer figures on the administrator detail page.
- Screenshots of the administrator statistics and the organizer page were reviewed at desktop and phone width. Fixed during review: a duplicate landmark on the organizer page, stretched chart cards, a wrapping money value and the width of the top-ten list. No horizontal page overflow at either width.
- Logs contained none of the test passwords, card number or hash fields.

Not run locally: a mobile browser pass of the statistics screens, a live mail provider, worker crash injection. The app has no dark theme, so charts use the light palette only; dark mode is not claimed. No independent review is claimed. CI gains a test:statistics step; hosted results belong to the pushed heads.

### Revision boundary

Input revisions: backend c55e9b5, frontend 7734395. Backend commits: c102671 (contract 0.8.0), 4fba079 (runtime), 588405d (suite and CI), then documentation. Frontend pins backend 588405d; frontend commits follow on feature/12-statistics. Pull requests into main are created by the agent and merged by the owner. Stop after stage 12; next is stage 13 acceptance, after a new instruction.

## Stage 11 - current delivery

Snapshot: 2026-11-08, Europe/Kyiv. Both PRs #7 (stage 10) were verified merged: backend main f4e73b0, frontend main 12eb745. Both repositories branched feature/11-administration from those heads. No merge, history rewrite or force push was performed.

Implemented: administrator search, details, contact edits, block/unblock and soft deletion of users and organizers with compensating, notifying cascades; administrator event and booking searches with the full filter sets; subscription and plan searches and plan archiving; city and direction management with a last-active guard; an append-only audit log of every administrator decision (also for event moderation and booking cancellation); the public session list no longer exposes unpublished events. OpenAPI 0.7.0 has 112 operations, 105 implemented; migration 010. Frontend: an Administration area (users, organizers, events, bookings, subscriptions, dictionaries, loyalty, administrator access) with URL-backed filters, detail pages and reason-confirmed actions. Not implemented: platform and organizer statistics (stage 12) and the optional administrator list (Q-05).

### Verification observed

- Backend lint, typecheck and production build passed; 16 Node tests passed; OpenAPI lint and route/status check passed (105 implemented operations).
- Isolated stack activehub-admin-check (ignored .env.admin; UI 8780, API 3900, Mailpit 8725, PostgreSQL 127.0.0.1:5599 and SMTP 127.0.0.1:1029 through a local-only override) applied migrations 001-010 to a new volume. Through the CI-style production-server harness db:verify, test:accounts, test:marketplace, test:loyalty, test:communications and the new test:administration passed. The account suite now drains a shared email queue.
- scripts/verify-administration.mjs passed: role denial and administrator IDs unreachable; every user and organizer filter alone and combined; contact edit validation; block versus delete; deletion of a user with PENDING, paid, free and subscription bookings cancelled once under two concurrent administrators with one refund, visits restored, points reversed, history and contact redaction kept; organizer block (hidden, bookings continue and are payable) and delete (events cancelled and refunded, finished history untouched, plans archived, members notified); a payment racing a deletion; event, booking, subscription and plan searches; plan archive; dictionary add, rename, deactivate with references kept and two concurrent last-value deactivations refused; self-block refusal and append-only audit.
- Frontend lint, typecheck, build and api:check passed. Playwright against the same stack: 12 passed, 4 skipped (mobile duplicates of the desktop-only workflows). The new administration workflow searches by email, edits, blocks and unblocks, cancels a paid booking, blocks an event, manages a city, removes an organizer and confirms member denial. Screenshots of the administration home, users, events, bookings, dictionaries and a user page were reviewed at desktop and phone width: English text, no horizontal page overflow.
- API and worker logs contained none of the test passwords, card number or hash fields.

Not run locally: mobile browser workflow, photo removal through an upload fixture, a statistics dashboard, worker crash injection, a live mail provider. No independent review is claimed; review was a separate pass in this session. CI gains a test:administration step; hosted results belong to the pushed heads and are not claimed here.

### Revision boundary

Input revisions: backend f4e73b0, frontend 12eb745. Backend commits: 71720a7 (contract), 60ef943 (accounts, cascades, searches), d55d432 (dictionaries and subscription searches, pinned by the frontend manifest), d1d953b (suite and CI), then documentation. Frontend commits: 3b6db67 (contract pin and client), 77e5cf0 (screens), dc4b856 (browser test), then documentation. The tested pair is backend d1d953b runtime with frontend dc4b856; documentation commits follow and change no runtime.

Startup: `docker compose up --build --wait` from the backend applies migration 010 and keeps volumes. Pull requests into main are created by the agent and merged by the owner. Stop after stage 11; next is stage 12 statistics, after a new instruction.

## Stage 10 (historical)

Snapshot: 2026-11-08, Europe/Kyiv. Both PRs #6 (stage 09) were verified merged: backend main 6055732, frontend main 3baae5c. Both repositories branched feature/10-communications from those heads. No merge, reset of published history or force push was performed. Two unpublished local backend commits were rebuilt before the first push because a staged file deletion had landed in the wrong commit.

Implemented: every notification is stored in the site and, per the delivery table and the user's preferences, also queued for email in the same transaction; a configurable SMTP adapter (Mailpit by default, Gmail or another provider through environment variables with STARTTLS or TLS, authentication and certificate checks); one text and HTML template with an absolute link; an outbox dispatcher with backoff, permanent failure and attempt limits; persisted 24-hour and 2-hour reminders; administrator edit and cancellation notices to organizers; card upgrade emails default on until the loyalty preference is changed; user-organizer chat with ordered messages, event cards, read state, unread counts, polling, blocked and administrator restrictions and a rate limit. OpenAPI 0.6.0 has 112 operations, 84 implemented. Frontend: header unread badges, conversation list and thread with live updates, Message buttons on events, organizers and organizer booking details, a notification center with live refresh, unread filter and email status. Not implemented: the optional subscription near-expiry and password recovery emails, administrator account-blocking notices (stage 11) and push delivery.

### Verification observed

- Backend lint, typecheck and production build passed; 16 Node tests passed (settings, templates, error classification and the earlier pricing tests). OpenAPI lint and route/status check passed (84 implemented operations).
- Isolated stack activehub-comms-check (ignored .env.comms; UI 8680, API 3800, Mailpit 8625, PostgreSQL 127.0.0.1:5588 and SMTP 127.0.0.1:1028 through a local-only override) applied migrations 001-009 to a new volume. Through the CI-style production-server harness: db:verify, test:accounts (now using the new mail adapter), test:marketplace, test:loyalty and test:communications all passed.
- scripts/verify-communications.mjs passed: the 7.9 table by recipient, channel and category for registration, requests, approval, rejection reason, payment success and failure, user and organizer cancellation, refunds, expiry (organizer in-app only for PENDING), session full, address change, event cancellation, subscription purchase, loyalty points and upgrade, matching event and promotion, reminders and administrator edit, moderation and cancellation; mandatory booking email with all optional emails off; email read back from Mailpit; outage deferral then single delivery; permanent failure; attempt exhaustion; no duplicates on repeated dispatch; chat starts, denials, read state, cursor polling, 16 concurrent messages from eight sessions gap-free, blocked recipient and sender, rate limit and immutability.
- Real provider path: a local Mailpit requiring STARTTLS and a login accepted the real worker container's mail with the configured sender; a wrong password gave a credential error with a hint, an untrusted certificate was rejected unless explicitly allowed, and the password never appeared in worker logs. A live Gmail account was not used.
- Frontend lint, typecheck, build and api:check passed. Playwright against the same stack: 11 passed, 3 skipped (mobile duplicates of the desktop-only workflows). The chat test sends from an activity, sees the organizer's unread badge without reload, replies, and sees the reply, the Read marker and the notification.
- Captured API and worker logs contained none of the test passwords, card number, app password or hash fields.

Not run locally: mobile chat layout and screenshots, DST-edge reminders in real time, worker crash fault injection, a live Gmail account, long-history chat paging. No independent review is claimed; review was a separate pass in this session. CI gains a test:communications step; hosted results belong to the pushed heads and are not claimed here.

### Revision boundary

Input revisions: backend 6055732, frontend 3baae5c. Backend commits: 9dfe7f2 (contract), 9f760e6 (triggers and reminders), 45c7dc1 (email), ed1c6d5 (chat, pinned by the frontend manifest), ce81771 (suite and CI), then documentation. Frontend commits: 85ae787 (contract pin and client), 96c2219 (chat), 4391c6b (notification center), 75a8925 (browser test), then documentation. The tested pair is backend ce81771 runtime with frontend 75a8925; documentation commits follow and change no runtime.

Startup: `docker compose up --build --wait` from the backend applies migration 009 and keeps volumes. Email setup: README Email section. Pull requests into main are created by the agent and merged by the owner. Stop after stage 10; next is stage 11 administration, after a new instruction.

## Stage 09 (historical)

Snapshot: 2026-11-08, Europe/Kyiv. Both PRs #5 (stage 08) were verified merged: backend main 8429402, frontend main 43fccb5. Both repositories branched feature/09-loyalty from those heads. Earlier branches are retained; no merge, reset, rebase or force push was performed. The owner approved Q-01 (reversal clamped at zero), Q-02 (session month in Europe/Kyiv) and Q-04 (Corporate card until calendar expiry); Q-05 remains open. Details are in ASSUMPTIONS.md.

Implemented: migration 008 (points ledger with once-only accrual/reversal indexes, free-visit ledger, booking card/award snapshot, card assignment history, base level); ordered PriceStep Chain of Responsibility pricing; session-month free quota reserved per place and returned once; awards on CONFIRMED for card, free and subscription bookings; once-only clamped reversal on cancellation; Premium upgrade by lifetime points; Corporate on purchase until the last corporate subscription expires, with hourly reversion; administrator-locked cards; administrator level/rules configuration, card assignment and points adjustment; member loyalty summary and paginated ledger. OpenAPI 0.5.0 has 112 operations, 79 implemented. Booking jobs now commit per booking. Optional redemption remains planned (S-04).

Frontend: pinned contract 0.5.0 at backend 3f38561554d6b4c45048375d845f8f02f64bcc1f, loyalty page, administrator Loyalty settings, awarded points on booking details and a server-pricing note on the booking form.

### Verification observed

- Backend lint, typecheck and production build passed. Node tests: 9 passed, including six new pricing/award/Kyiv-month tests. OpenAPI lint and route/status check passed (79 implemented operations match route exports; approved and open decisions checked).
- Isolated Compose stack activehub-loyalty-check (ignored .env.loyalty; UI 8580, API 3700, Mailpit 8525; a local-only override exposes PostgreSQL on 127.0.0.1:5577) applied migration 008 to a new volume. db:verify passed with probe changes rolled back.
- scripts/verify-loyalty.mjs passed twice against that stack: exact awards and repeated-cancellation reversal; Q-01 clamped reversal after an administrator deduction and overdraw rejection; Premium upgrade with one notification; session-month quota with ordered free/card breakdowns, return on cancellation and rejection without points; concurrent requests for the last free visit granted once; corporate purchase upgrade, subscription award, exhaustion retention and expiry reversion; administrator lock, assignment history, idempotent adjustment and denial cases; ledger sums equal balances. It restores the default settings afterwards.
- scripts/verify-marketplace.mjs passed twice on the same stack after the change, including worker expiry/completion without duplicate transitions.
- Frontend lint, typecheck, build and api:check passed. Playwright against the same stack: 10 passed, 2 skipped (the mobile duplicates of the desktop-only marketplace and loyalty workflows). The new loyalty workflow books and pays through forms, checks awarded points and the loyalty page, then assigns a locked Premium card, rejects an overdraw and records an adjustment.
- Captured API/worker logs contained none of the test passwords, the configured administrator password, the test card number or hash fields.

Not run locally: the accounts suite (it needs a host-exposed SMTP port; CI runs it), mobile loyalty browser flow, screenshot review, DST browser combinations, load and crash fault injection. No independent review is claimed; review was a separate pass in this session. CI gains a test:loyalty step; hosted results belong to the pushed heads and are not claimed here.

### Revision boundary

Input revisions: backend 8429402, frontend 43fccb5. Implementation commits: backend 1bfbebc (contract), 3f38561 (loyalty runtime), 215b930 (risk suite and CI); frontend c9014e1 (contract pin and client), ab5f5cb (screens), 9434c78 (browser test). The tested pair is backend 215b930 runtime with frontend 9434c78; this documentation commit follows it and changes no runtime. The final published pair belongs in the local handoff.

Startup: `docker compose up --build --wait` from the backend applies migration 008 and keeps existing volumes. Pull requests into main are created and merged by the owner. Stop after stage 09; next is stage 10 communications, after a new instruction.

## Stage 08 (historical)

Stage 08 implements organizer plan create/edit/archive, all three plan types, immutable purchased terms, simulated card purchase without purchase refunds, own subscription pages/selection, transactional per-place visits, once-only returns on rejection/cancellation/expiry, exhaustion and hourly persisted expiry. Corporate loyalty remains stage 09; Q-04 is unchanged. Optional expiry messages are not implemented.

Both PRs #4 were verified merged; clean worktrees advanced main by fast-forward and branched feature/08-subscriptions. Contract 0.4.0 was defined before code; frontend pins the backend implementation revision.

Checks: backend/frontend typecheck and production build passed. Real PostgreSQL/API smoke passed purchase, two-place reservation/debit and cancellation restoration, plus immutable terms/continued usage after plan edits/archive. The targeted last-visit race produced one success and one conflict; zero visits became EXHAUSTED, repeated cancellation restored exactly one visit and ACTIVE. Scope/type combinations, CORPORATE/company paths, unlimited visits, worker expiry/REJECTED compensation and browser forms were not exercised in this reduced run. No full regression/E2E, screenshots or new broad test suite was run locally; existing CI is unchanged.

Migration: `docker compose up --build --wait` from backend applies 007_subscriptions.sql through the existing initializer. Preserve existing volumes. Final PRs/revision pair are recorded in the local subscription handoff and PR descriptions. Stop after stage 08; next is stage 09 loyalty and shared compensation acceptance.

## Historical stage 05-07 evidence

Snapshot: 2026-11-08, Europe/Kyiv. Stages 05-07 are implemented for catalog, card/free bookings and simulated payments. Stop after stage 07. Subscription/loyalty integration remains unfinished for stages 08-09; the full communications matrix remains stage 10. Q-03 is approved; Q-01/Q-02/Q-04/Q-05 remain open.

## Stages 05-07

- Fetched both remotes; PRs #1/#2/#3 were merged. Local main advanced by fast-forward to backend 6fff9c3 and frontend 7e73b65. All original branches were retained; work started clean on feature/05-07-marketplace. No merge, reset, rebase or force push was performed.
- Stage 05: authenticated catalog/organizers, URL filters/paging, recommendations foundation, owned event/session management, decoded event photos/order/cover, pause/resume/cancel/soft deletion. Real creation/discovery/idempotence/pause/resume/access smoke passed. Frontend lint/types/build passed.
- Stage 06: PostgreSQL event/session locks and partial unique indexes reserve places; kind Strategy handles ordinary/team/exclusive hall units. Persisted seven-state history, MANUAL decisions, deadlines, cancellation, list/calendar and background expiry/completion are implemented. Q-03 uses an inclusive server cutoff.
- Stage 07: format/expiry-validated simulator, FAILED retries, immutable price snapshots, receipt, HMAC idempotency and full once-only refunds. Shared time/address changes and event/session cancellation grant/execute refunds and release capacity transactionally.
- OpenAPI 0.3.0: 112 operations, 62 implemented and 50 planned; lint and route-export/security metadata check passed. Later benefit/communication modules remain planned.

### Verification observed

- Both applications: lint, typecheck and production build passed. Three existing backend Node tests passed. Backend real PostgreSQL/API accounts suite passed, including seeded/new ADMIN. Required seeds/migration checksum and repeat-initialization verification passed with probe changes rolled back.
- scripts/verify-marketplace.mjs passed against isolated activehub-marketplace-check PostgreSQL/API: paid/refund flow, MANUAL approve/reject, free booking, decline/retry, competing last place/hall/duplicate active user, guest/role/foreign-owner/CSRF denial, immutable prices, reserved-capacity/delete guards, key mismatch, cutoff either side, changed-time/address refund, event/session cascades, expiry/completion and repeated worker without duplicate transitions. Exact equality is checked in the cutoff predicate, rather than claiming exact HTTP transport timing.
- Browser: the new desktop marketplace scenario passed through actual forms/API, including reload and refunded receipt. Three existing desktop account scenarios passed, including seeded administrator creation. An early run used the old frontend during rebuild; a subsequent run exposed dropdown accessible-name ambiguity, corrected with explicit names. The successful marketplace run took approximately four seconds.
- Database responses/payment/idempotency records were checked for full PAN/CVV absence. Decoded event photo upload/order/delete and invalid-content rejection passed. Authenticated recommendations returned real data. Captured API/worker logs contained none of the configured/test secrets or checked PAN/hash fields. The final published pair is recorded in the local handoff and linked PRs.
- Review uses a separate pass in this session; no independent review is claimed. Broad field/filter combinations, every transition edge, visual/multiple-engine coverage, calendar/DST matrix, load and crash fault-injection were not run. Existing CI checks remain enabled; the new API risk suite is added to backend CI and one desktop workflow to frontend CI.

Hosted backend CI [42503786418](https://github.com/Vitaliiir16/activehub-backend/actions/runs/42503786418) passed at 79e376fc1733974a6e9670ed94fa3b73bff8c9fb, including clean database initialization, accounts and marketplace suites. The first frontend hosted run passed the new marketplace flow but exposed an ambiguous old account health selector; the frontend correction preserves every check. Final-head results belong in the PR and local handoff.

### Revision boundary

Implementation checkpoints: backend dedcf768d3b445560c4e0443af5868223f16cb58 (catalog), 2e8141f68c4f1880082ff6fb50a10da7cffa1eea (bookings), d1e48006cdcdd28cfad7aa7ad03cc63d1fda12ee (payments); frontend a969d9a (catalog), fbee90a145528d98fff1b1517e17ba800708bd12 (bookings). Later review fixes and final documentation follow in meaningful commits. The frontend manifest pins its backend contract; the final tested pair belongs in the local handoff and PR descriptions because this document cannot contain its own final SHA. New PRs target main directly.

Startup and manual acceptance: [MARKETPLACE_REVIEW.md](MARKETPLACE_REVIEW.md). Next authorized delivery would be stage 08, followed by stage 09 and shared financial compensation acceptance. No remaining business rule is silently approved.

## Historical stage 04 snapshot

The following evidence describes the earlier account delivery and its then-open PR dependencies; the current state is above.

## Stage 04 delivery

- USER/ORGANIZER two-step registration, strict server validation, globally unique normalized email, automatic sign-in and role landing pages.
- Existing salted scrypt hashes; opaque HTTP-only cookies with token digests, seven-day configurable sessions, CSRF/context binding and exact Origin/Fetch Metadata checks. Logout, expiry and account blocking/deletion invalidate access. Password changes verify the current password, rotate the current session and revoke other sessions.
- Own role-specific profiles, unique email edits, city/direction preferences, notification settings and decoded owned profile photos/logos. Existing inactive dictionary selections remain readable/retainable; new selections must be active. Initial card metadata is stored with profiles without implementing loyalty behavior.
- ADMIN-only creation form/API and block/unblock by account ID, serialized self/last-active protection. No administrator deletion, optional administrator list or general administration module.
- Transactional welcome in-app notification and durable email outbox; worker claims/retries only welcome messages through the implemented MailpitWelcomeMail Adapter. Notification read-one/all is owner scoped.
- English responsive forms, loading/validation/error/success states, session restoration, role routes and honest dashboard placeholders. OpenAPI 0.2.0 marks 21 operations implemented and 89 planned; status matches actual route exports.

## Evidence actually observed

| Check | Result and limit |
|---|---|
| Backend lint/typecheck/build | Passed locally and in Docker; Next.js REST routes only. Build tracing warning was corrected by scoping runtime upload paths. |
| Node tests | Three passed: bootstrap validation, salted password verification and HTTPS cookie/origin rejection. |
| Actual PostgreSQL/API acceptance | Passed for both registration roles and automatic login; concurrent cross-role duplicate email yields one 201 and one 409; invalid fields/password/name/phone/email, role/owner injection, guest/wrong-role/foreign-image/notification denial. |
| Session/security behavior | Passed: HttpOnly/SameSite/seven-day attributes, token digests, missing/invalid/foreign CSRF and hostile Origin rejection, reload, expiry, logout, block/delete revocation, generic wrong-credential response, current-password validation and other-session revocation. HTTPS Secure and cross-site/missing-Origin checks have focused Node coverage. |
| Profiles/reference data | Passed: role-owned edits, duplicate email, preferences/settings, decoded image/size/type checks, foreign ownership denial and inactive selection retention/new-selection rejection. Browser checks also edit email and sign in with the new address. |
| Administrator access | Seeded/new ADMIN flow passed; USER create denied, self-block denied; competing mutual-block requests serialize to one success and one invalidated session, preserving an active administrator. |
| Required seeds/migrations | Real db:verify passed after stage 04 upgrade; repeat initialization preserves rows/edits and rejects altered migration checksums. Existing volumes were retained; a separate clean stage 04 stack was created. |
| Welcome outbox/Mailpit | One logical welcome notification/outbox per registration, concurrent row claims, completed replay without another attempt, actual Mailpit receipt. Real SMTP outage produced persisted failure/retry; recovery sent one email in the checked scenario. |
| Restart/storage/logs | Session and owned image persisted across API/worker restart. Worker SIGTERM exited 0 and closed connections. Captured API/worker/init logs contained none of the configured/test credentials or stored token/password-hash fields. |
| Frontend checks | lint/typecheck/build, generated types/hash and typed real health passed. Eight desktop/mobile Chromium cases passed against PostgreSQL/API/Mailpit; screenshots reviewed. Cases cover both signup roles, profile/email/photo/preferences, reload, password change, sign-out/login, welcome reading/email and seeded/new ADMIN. |
| Contract/models/docs | OpenAPI lint without warnings; 110 unique operations, 21 implemented route exports and security metadata checked. Use Case statuses updated; actual account/module/SQL/worker/Adapter diagram compiled. English text, links, matrix/source integrity and staging audit recorded at handoff. |
| Dependencies | Exact versions/lockfiles retained; npm installation/audits reported zero vulnerabilities in both repositories. No global machine settings changed. |

The SMTP protocol has an unavoidable crash window after a message is accepted but before the database transaction commits. Stable Message-ID and persisted retries support investigation; external exactly-once email delivery is not claimed. No business integration coverage or independent review is claimed. Review passes were performed separately in the same session.

Review fixes included CSRF validation before rate-counter writes, preserved inactive selections, persisted profile metadata instead of hardcoded values, bounded/decoded uploads, generic credential responses, credential-redacted browser output and serialized administrator access checks. Early browser failures were corrected: an invalid PNG fixture and a test navigation race during logout; later full runs passed.

## Revisions and PR dependencies

| Boundary | Backend revision | Frontend revision |
|---|---|---|
| Foundation input | c20ff7b36e5715f9e7cbe118c5463b79d6635e5d | bc3b4a0b9e342e4e3f0fff4e52870b7b6fe988dc |
| First hosted green account pair | 4ae4184b8f86555044af65a438268a11dfaf1766 | 305ac73eed15a61c50d123507bf051ae3116d961 |
| Reviewed account/runtime acceptance snapshot | 48af143149db81303ac6b67b39cc148f94d8d3ae | 5e3ba3d275c6f926a2eb7343067b90504908f87b |
| Current backend security-test snapshot | 134693e0d45f876a2252dfccb845bd49118698a8 | Same frontend snapshot above |

Frontend contracts/backend.json pins backend e63887f3b9f3d06166a5957d4cc385e16a3e80d6 and the exact contract hash. Later backend changes at this boundary add acceptance/security tests and documentation, with the same runtime/contract. The final published pair and final-head CI results belong in PR descriptions and the local handoff; this document cannot contain its own final commit SHA.

- Backend stage 04 PR: https://github.com/Vitaliiir16/activehub-backend/pull/3
- Frontend stage 04 PR: https://github.com/Vitaliiir16/activehub-frontend/pull/3
- Both target feature/00-03-foundation because PR #2 is still open; PR #2 depends on setup PR #1. Both #1 and #2 were open/unmerged on inspection. No merge or PR closure was performed; the owner retains merge control.
- [Backend CI 42496644158](https://github.com/Vitaliiir16/activehub-backend/actions/runs/42496644158): success at the first hosted snapshot above, using PostgreSQL/Mailpit and a built production server.
- [Frontend CI 42496646506](https://github.com/Vitaliiir16/activehub-frontend/actions/runs/42496646506): success at the first hosted snapshot, including pinned public backend checkout, canonical-contract comparison, Compose and eight real browser checks.
- Final-head runs are checked after publication; earlier results are not presented as runs of later commits.

No owner work was overwritten; both worktrees were clean at the start. Feature branches are feature/04-accounts-access. Main was not advanced because previous PRs remain unmerged. Local instructions, original source and private environments remain excluded; the parent is not a Git repository.

## Run and review

Normal startup from activehub-backend:

~~~powershell
node scripts/create-local-env.mjs
docker compose up --build --wait
~~~

Generate .env only once. Frontend: http://localhost:8080; Mailpit: http://localhost:8025. Initial administrator credentials are private in .env. [ACCOUNTS_REVIEW.md](ACCOUNTS_REVIEW.md) gives the full manual sequence and isolated acceptance commands. The account suite requires ACTIVEHUB_TEST_WRITES=true and a dedicated test database; it must not be run against real users.

This session's retained isolated stack is activehub-accounts-check with ignored .env.accounts, frontend 8280, API 3400 and Mailpit 8225. A local-only Compose test override temporarily exposes PostgreSQL on 5544 and SMTP on 1026 for the production-server smoke. These ports are localhost-only; no unrelated data/volumes were removed. Final handoff records its exact current startup command.

## Open questions and next stage

Q-01 spent-point reversal/nonnegative balance; Q-02 quota month/rescheduling; Q-03 exact booking cutoff; Q-04 corporate exhaustion/card eligibility; Q-05 optional administrator list scope. Proposals remain unapproved.

Stop after stage 04. The next implementation stage is 05 catalog, on a later authorized run. Review/merge the prior PR chain in order, retarget dependent PRs as appropriate, then inspect both remotes/worktrees and fast-forward main only after actual merges. Re-read the requirements, plan, assumptions and pinned contract before proceeding.

Original source/archive SHA-256 remains 3007989B9382778A793013D37EAF5F34CD8D98EDB077E1780E85C212927770CE. PlantUML 1.2026.9 renders models locally using pinned image digest sha256:9b5071ab56a4192aac458ab4b0d42261c22c8109695894ae5be6013c3be6cac1. No source was sent to a remote diagram renderer.

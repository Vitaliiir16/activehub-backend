# Delivery plan

Stages 00-04 have delivered models, scaffolds, infrastructure, contract foundation and accounts/access. Evidence and revision boundaries are recorded in PROGRESS.md. The current run stops after stage 04. Catalogs, bookings, payments, subscriptions and loyalty behavior remain planned. Demo records remain deferred until their entities exist.

## Stages and acceptance

| Stage | Scope | Depends on | Exit evidence |
|---|---|---|---|
| 00 Analysis | Requirements baseline/matrix, decisions, architecture; complete Use Case diagram and whole-system class diagram including layers/services | Supplied specification | Every mandatory requirement mapped; diagrams cover source actors/use cases/entities; proposed patterns have reasons and interactions; open business conflicts explicitly scoped |
| 01 Scaffolds | Next.js TypeScript REST backend; separate React TypeScript frontend, routing and base layout; choose runtime/build/test versions | 00 modeling | Both apps run; installed versions/lockfiles recorded; actual scripts for typecheck/lint/build and focused tests documented; basic health route defined rather than presumed |
| 02 Infrastructure | PostgreSQL, migrations, required seeds, Dockerfiles, backend-owned Compose, sibling frontend context, worker process, Mailpit, volumes/proxy; demo seed implementation deferred to 13 | 01 | Clean one-command startup; init completes before API/worker; healthy database; restart keeps data/uploads and does not duplicate seed records; no real outbound email; `.env.example` documented |
| 03 Contract foundation | Real OpenAPI, errors, field validation, paging/sort/filter conventions, auth/CSRF/cookie and idempotency decisions, generated or typed frontend client | 00-02 | Specification parses/lints; frontend client agrees with reviewed schema; exact backend revision recorded; no invented implementations claimed |
| 04 Accounts | USER/ORGANIZER two-step signup, sessions/logout/password/profile, preferences, dictionaries, first admin and admin-creation capability, role layouts | 02-03 | Role/ownership denial tests; unique email; automatic sign-in; blocked-session revocation; signup welcome effects; dictionary seed/deactivation checks |
| 05 Catalog | Organizer/event/session CRUD, uploads, pause/resume, all catalog/detail screens, URL filters, pagination and recommendations foundation | 04 | Organizer creates discoverable event; authenticated discovery and edit rules work; guests denied; file/session validation; ANY and full-event filters; no price-snapshot regression |
| 06 Bookings | Lifecycle, persisted timeline, atomic seats, kind policies, deadlines, list/week-month calendar, organizer decisions, cancellation coordination | 05 and Q-03 | Concurrent last-seat/hall/duplicate-user cases pass; immutable terminal states; deadline boundaries; cancellation/changed-event cases represented; reserve compensation hooks for later stages |
| 07 Payments | Card simulator, payment attempts/retry, receipt, once-only refund, immutable price snapshot | 06 | Required success/decline cards; 1-2s simulation; retry before deadline; repeated payment/refund no duplicates; no full card/CVV persistence; zero/subscription bypass coverage |
| 08 Subscriptions | Organizer plan lifecycle, card purchase, scopes/validity, visits, corporate company/place rules, my subscriptions | 07 | All types and scope/expiry cases; simultaneous last-visit claims; restored visits; archived-plan continuity; no purchase refunds |
| 09 Loyalty | Configurable tiers/awards/ledger, ordered pricing, free quota and corporate rules, loyalty screen and admin adjustments | 07-08; Q-01/Q-02/Q-04 for affected rules | Exact award/refund snapshots, free/subscription awards, no double effects, quotas serialized, admin locks respected, nonnegative balance, configured defaults; joint financial regression suite |
| 10 Communications | In-app center, email outbox/dispatcher/templates/preferences, all notification triggers, chat/read/unread updates, reminder jobs | 04-09 | Entire mandatory 7.9 table checked by recipient/channel/preference; no duplicates after retry/restart; chat live without reload; contact/ownership/admin restrictions |
| 11 Administration | Complete management screens/filters, safe cascading cancellation/deletion, loyalty configuration, last-admin protections | 04-10 | Exact user-ID and full event filters; contact rules; history survives soft deletion; block vs delete behavior; concurrent last-admin operations denied |
| 12 Statistics | Organizer/admin/user aggregates, recommendations completion, charts and period filters | 05-11 | Known PostgreSQL fixtures produce exact counts, revenue net of refunds, conversion/breakdowns; organizer isolation; preference and no-preference recommendations |
| 13 Acceptance | Mandatory matrix closure, real integrated E2E for all roles, security/access/concurrency, responsive states, diagrams/pattern index/README, reproducible demo | 00-12 | All mandatory rows have implementation and test/manual evidence; Compose clean start/restart; actual cross-repo revisions recorded; no unresolved mandatory-rule conflict; independent review recorded when performed |
| 14 Optional [S] | Recovery, schedule generator, organizer calendar, redemption, expiry notices, free-only switch, dedicated admin list | All mandatory stage 13 accepted | Each optional row separately tested; mandatory regression remains green; no optional claim without evidence |

The dependency table is not permission to call unfinished integration complete. Notification event types and outbox hooks must be designed with their originating features; stage 10 completes delivery and rechecks all previous triggers. Cancellation crosses bookings, money, visits, points and quota: stages 06-09 stay provisionally integrated until joint tests pass. Base price/promotion snapshots appear before loyalty; stage 09 completes the required final pricing pipeline. Q-01 affects spent-point reversals most directly when [S] redemption is added, but the rule must be settled before claiming the full ledger safe. Unrelated scaffolding/catalog work can proceed while questions remain open.

Stages 05-07 now have implementation and risk-based evidence in PROGRESS.md. Q-03 is approved. Their cross-module subscription/loyalty compensation remains provisional until stages 08-09. The current run stops after stage 07.

## API synchronization

1. Backend proposes contract changes and acceptance examples first in `docs/openapi.yaml` and `docs/API_CHANGELOG.md`. The foundation now exists; health, accounts and the stage 05-07 operations marked implemented in OpenAPI are available.
2. Review auth, ownership, lifecycle, amounts, timestamps, errors, filtering, pagination and repeat-request behavior before code relies on them.
3. Implement and verify backend behavior against that contract, using real PostgreSQL for integration acceptance.
4. Record the backend commit; update/generate the frontend client and UI against that exact revision. Record the contract hash when it exists.
5. Run both applications at the pinned pair, capture checks and add reciprocal PR links. Update `PROGRESS.md` and frontend `BACKEND_CONTRACT.md` with actual compatibility evidence.
6. For incompatible changes, expand backend compatibility first, migrate the consumer second, retire old behavior in a later reviewed change. Do not rely on moving branch names as proof of compatibility.

The account client and real-stack checks establish stage 04 compatibility. Planned OpenAPI operations remain unavailable. The frontend must not invent behavior to unblock later modules.

## Delivery workflow

Use a separate `setup/<topic>` or `feature/<stage>-<topic>` branch per repository and change. With an empty remote, publish the first meaningful documentation commit on `main`; do not create an empty base commit or a PR without a base. All subsequent work uses branches and pull requests. Cross-link related changes and preserve the separate commits. Merge stays with the owner; no force push, rewritten history or stage-wide squash.

Keep each commit to one coherent change, including meaningful tests when needed. Stage named files, inspect the staged diff and never include secrets or local environment data. Use clear English messages such as `docs: define delivery and acceptance criteria` or `feat(bookings): reserve session capacity transactionally`. Do not create a quota of commits or one commit per file.

Before marking a stage complete, review the whole diff separately from writing it. Check requirements, edge cases, data ownership, contract compatibility and failure behavior, fix findings and rerun affected checks. An independent review session is desirable for each stage; record who/what reviewed the revision and never imply independent review when only a same-session pass occurred. PR descriptions state outcome, requirement IDs, actual checks, unresolved limitations and the related repository revision. A merge request is ready only with concrete changes and evidence.

## Verification policy

Current checks include lint/typecheck/build in both repositories, bootstrap/password tests, real PostgreSQL/API account acceptance, initialization/restart checks, OpenAPI lint and health-schema validation, generated types and eight desktop/mobile account tests with Mailpit. Welcome SMTP outage/recovery and worker shutdown have been checked locally. Documentation checks include source/archive hash, English text, inventories, links, whitespace and staged-secret review. See PROGRESS.md for exact outcomes and limitations.

Later modules must extend the existing checks with domain/PostgreSQL integration and meaningful component tests. Planned integrated checks: E2E for three roles; last-seat/hall and duplicate-user races; repeated payment/refund/worker actions; concurrent visits/points/quota; changed-time/address full refund; session revocation; data isolation and no admin chat access; last-active-admin race; business restart durability; Europe/Kyiv calendar/DST and exact deadline boundaries. Run appropriate checks on each change; broaden only when warranted.

GitHub Actions runs on PRs and pushes. Backend checks use a real PostgreSQL service. Frontend checks pin the backend commit from the contract manifest and build the paired Compose stack. Cross-repository access relies on the backend's public visibility; reassess credentials if visibility changes. These workflows do not claim business integration coverage.

## Resume and handoff

Read requirements, plan, decisions, architecture, progress and the frontend contract record. Inspect both worktrees and branches, compare local and remote heads, and preserve uncommitted work. Select the next unfinished stage and state its acceptance criteria. Record actual changes, checks with outcomes, blockers and precise next actions before stopping.

Every progress snapshot names the backend/frontend revisions it assessed. A file cannot embed its own final commit SHA; label whether a pair describes input revisions, a tested pair or final published revisions. Record final hashes in the local handoff or a subsequent progress commit rather than amending history recursively. Never infer application compatibility from documentation-only snapshots.

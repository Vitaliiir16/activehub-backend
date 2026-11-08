# Delivery progress

Snapshot: 2026-11-08, Europe/Kyiv. Stages **00-03 are complete for the authorized foundation scope**. Stop before stage 04. All business modules, authentication enforcement, worker jobs and optional features remain planned. Q-01 through Q-05 remain open.

## Delivered

| Stage | Result | Evidence |
|---|---|---|
| 00 | Complete proposed Use Case and whole-system UML class models, layers/services and GoF collaboration sequence | MODELING.md; all three PlantUML sources compiled and rendered, all 50 source use-case IDs reviewed, SVG layout inspected |
| 01 | Next.js REST TypeScript backend and separate React/TypeScript Vite frontend with exact lockfiles | Both lint/typecheck/build scripts passed; real production health smoke passed |
| 02 | PostgreSQL 18, checked SQL migration, required idempotent seeds, initial administrator, Dockerfiles/Compose, worker lifecycle, Mailpit, named volumes and API proxy | Clean isolated startup, initializer exit 0, five healthy long-running services, repeated startup/persistence and real database checks |
| 03 | OpenAPI, conventions, generated typed health client and CI | 109 operations lint clean; only health implemented, 108 planned; exact contract hash/types verified; real 200/503 schema checks; desktop/mobile browser tests |

Required seeds are 15 cities, 16 directions, three loyalty levels, singleton loyalty rules and one initial administrator. The worker performs readiness/heartbeat and graceful shutdown only. No business jobs or email delivery exist. Demo records are deferred until business entities exist; demo mode is explicitly rejected. Bootstrap SQL tables are not the proposed domain services/classes.

## Verification actually performed

| Check | Result and boundary |
|---|---|
| Backend lint, typecheck, production build | Passed; build exposes only /api/health plus framework not-found handling |
| Backend Node tests | Two passed: bootstrap configuration validation and salted scrypt correctness/malformed inputs |
| Real PostgreSQL bootstrap | Passed: dictionary identities, required row counts, correct/incorrect password verification, repeat seeds without row changes, preservation of edited settings/dictionaries, changed bootstrap email does not create another administrator, applied migration checksum changes rejected |
| Clean Compose start | Passed after confirming no volumes existed for isolated project activehub-foundation-check; migrations completed before API/worker, frontend waited for API, worker waited for Mailpit |
| Repeated start | Passed: same account IDs, upload marker persisted, no duplicate seeds; test edits rolled back; no existing or unrelated volumes removed |
| Worker lifecycle | Healthy heartbeat; SIGTERM exit code 0 with database connections closed; repeat startup healthy; unexpected failure restart policy configured |
| Readiness failure and recovery | Direct API and frontend proxy returned 200; stopping only the test database produced real 503; OpenAPI validation passed for 503; recovery returned 200 |
| Mailpit | Health/API passed; zero captured messages, matching the absence of business jobs |
| OpenAPI | Redocly lint passed without warnings; 109 unique operations, status declarations, CSRF/access metadata and only implemented route verified |
| Frontend static checks | lint, typecheck, build and generated snapshot/type verification passed |
| Real client | Typed client reached API and PostgreSQL through nginx; no mocked backend |
| Browser checks | Two Chromium tests passed: desktop and Pixel 7 layout; real health response, English text, no horizontal overflow or page errors; screenshots reviewed |
| Documentation/models | Source/matrix/model review, English text, relative links, local exclusions, whitespace and staged-content audit; three rendered SVGs inspected |
| Dependencies | npm audits reported zero vulnerabilities in both lockfiles at verification time; targeted development lint overrides documented |
| Scope | No authentication, catalog, bookings, payment, subscription, loyalty behavior, messaging or scheduling implementation; no business integration or independent review claimed |

Local test stack uses API port 3300, frontend 8180 and Mailpit 8125. Its generated credentials remain in ignored .env.test. Volumes are retained. Default README setup uses 3000/8080/8025 and a separate activehub namespace.

## Revisions and publication

Both setup PRs remained open and unmerged at the start and at publication checks. Local main branches were not advanced; no merge was performed. Feature branches started from setup heads and new PRs are stacked on them.

| Boundary | Backend | Frontend |
|---|---|---|
| Setup input | f4eaf210bb97780f4d930cbb606d362fc4b8e1ba | 18756f1eacda3fb83c00a523d410f8438a3a0e8c |
| Verified runtime/initial hosted CI | 50d815768571baa02a733ad781c9665394a4e901 | d705a79b07056c11fe99474e3da9674b4df6bbf9 |
| Reviewed final contract snapshot | c40e993b87a8602e4378cd0ebbf06766eeb5421f | bc3b4a0b9e342e4e3f0fff4e52870b7b6fe988dc |

The final contract pair adds planned session/statistics queries and optional user cancellation reason; it does not change runtime handlers. Frontend contracts/backend.json pins the complete backend SHA and contract hash. Final published hashes are recorded in PR descriptions and the local handoff, since this document cannot contain its own commit SHA.

- Backend foundation PR: https://github.com/Vitaliiir16/activehub-backend/pull/2
- Frontend foundation PR: https://github.com/Vitaliiir16/activehub-frontend/pull/2
- Setup dependencies: https://github.com/Vitaliiir16/activehub-backend/pull/1 and https://github.com/Vitaliiir16/activehub-frontend/pull/1
- [Backend CI run 42492572615](https://github.com/Vitaliiir16/activehub-backend/actions/runs/42492572615): success at the runtime snapshot above, including real PostgreSQL and production-server/schema smoke.
- [Frontend CI run 42492575592](https://github.com/Vitaliiir16/activehub-frontend/actions/runs/42492575592): success at the runtime snapshot above, including public cross-repository checkout, byte-exact canonical snapshot, clean Compose and two real browser tests. That run pinned backend contract revision 4cc6e2424fc41e848a42503deffb4746f1b5fb00.
- Final-head workflow results after the documentation/contract refresh belong in the PR checks and handoff; earlier green runs are not presented as runs of later commits.

The separate review passes were performed in the same session, not by an independent reviewer. Findings fixed before handoff: UML syntax, incompatible lint dependencies/advisory, organizer contact visibility, bootstrap-email duplication, missing cross-event session/admin statistics queries and unnecessary mandatory user cancellation reason.

## Environment and reproducibility

Verified Git 2.55.0.windows.2, owner authorship and GitHub push access; Node 24.18.0; npm/npx 11.16.0; Docker Engine 29.9.2 with Linux containers; Compose 5.6.1. No global settings changed. Parent workspace remains outside Git. Initial worktrees were clean, and no owner changes were overwritten.

The immutable local source and archive retain SHA-256 3007989B9382778A793013D37EAF5F34CD8D98EDB077E1780E85C212927770CE. English authored text and display labels follow the owner's language instruction. PlantUML 1.2026.9 rendered diagrams using image digest sha256:9b5071ab56a4192aac458ab4b0d42261c22c8109695894ae5be6013c3be6cac1. Container images and application packages are pinned in Dockerfiles/Compose/lockfiles. The bootstrap password hash uses scrypt N=131072, r=8, p=1 with a fresh 32-byte salt.

From the backend directory, first-time setup and startup:

```powershell
node scripts/create-local-env.mjs
docker compose up --build --wait
```

For the existing isolated verification stack:

```powershell
docker compose --env-file .env.test -p activehub-foundation-check up --build --wait
```

Do not regenerate an existing environment file or remove persistent volumes to work around configuration issues. README describes variables and focused check commands.

## Open decisions and next action

Q-01: already-spent points reversal and nonnegative balance. Q-02: free-quota month and rescheduling. Q-03: booking exactly at the 30-minute cutoff. Q-04: exhausted corporate subscription/card eligibility. Q-05: dedicated administrator list scope. Proposals remain in ASSUMPTIONS.md and are not approved by this run.

Owner reviews/merges setup PRs first, then retargets foundation PRs to main and reviews them. No merge is performed here. The next development stage is 04 (accounts, sessions, access, registration and profiles), only on a subsequent authorized run. Before resuming, read current documents, inspect both worktrees/remotes/PRs, preserve local edits and fast-forward main only if its PRs have been merged.

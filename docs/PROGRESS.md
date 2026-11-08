# Delivery progress

Snapshot: 2026-11-08, Europe/Kyiv. Stages 05?07 are implemented for catalog, card/free bookings and simulated payments. Stop after stage 07. Subscription/loyalty integration remains unfinished for stages 08?09; the full communications matrix remains stage 10. Q-03 is approved; Q-01/Q-02/Q-04/Q-05 remain open.

## Stages 05?07

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

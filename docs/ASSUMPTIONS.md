# Decisions and open questions

Prepared on 2026-11-08. Proposals below are not implemented or approved business rules. Only the affected feature is held pending a decision; repository preparation can proceed.

## Recorded direction

| ID | Status | Direction and source |
|---|---|---|
| D-01 | Owner instruction | Use English in new documentation, code, UI, messages and seed display labels. This explicitly overrides the Ukrainian interface and validation text in source sections 3 and 10. Keep UAH and Europe/Kyiv. |
| D-02 | Owner instruction | Publish product engineering files only. Keep the original source archive local. The published English baseline is REQUIREMENTS.md and its source section references; the local `project.md` archive is byte-identical to the supplied source. |
| D-03 | Owner instruction, updated 2026-11-08 | Complete stage 04 accounts/access on backend and frontend, including welcome outbox delivery. Stop before catalog, bookings, payments, subscriptions or loyalty behavior. Q-01 through Q-05 remain open. |
| D-04 | Owner instruction | Commits, push and pull requests are authorized in both repositories; merge remains manual with the owner. No force push or history rewriting. Empty repositories start with a meaningful documentation commit on main. |
| D-05 | Fixed source constraint | Next.js REST API + TypeScript, separate React + TypeScript frontend, PostgreSQL and Docker Compose. No framework substitution. |
| P-01 | Selected and locally verified | Node 24, Next.js 16.4.5, React 19.3.1, Vite 8.3.6, TypeScript 5.9.3, ESLint 10.14.0. Exact dependencies and transitive versions are locked separately. TypeScript stays within the declared TypeScript ESLint support range. |
| P-02 | Infrastructure implemented; jobs planned | Backend-owned Compose, sibling frontend, PostgreSQL, worker lifecycle/heartbeat, Mailpit and named database/uploads/mail volumes. Outbox and business jobs remain planned. No Redis. |
| P-03 | Implemented and verified | Opaque HTTP-only cookie sessions, persisted token digests, session-bound CSRF and exact Origin validation. Details and test boundaries are in API_CONVENTIONS.md and PROGRESS.md. |
| P-04 | Contract defined; business calculations planned | JSON money uses integer UAH minor units; decimal rates use strings. Persist UTC instants and interpret calendar filters in Europe/Kyiv. Q-02 remains open; the later Q-03 decision below approves the inclusive cutoff. |
| P-05 | Proposed technical choice | Polling is sufficient for live chat and counters initially, if it meets the no-manual-reload requirement. Choose the interval and test stale/out-of-order responses; SSE remains an option. |
| D-06 | Owner instruction, 2026-11-08 | Deliver stage 09 loyalty on new branches after PRs #5 were merged. Commit and push are authorized; the owner creates and merges pull requests. Q-01, Q-02 and Q-04 are decided below; Q-05 remains open. |
| D-07 | Owner instruction, 2026-11-08 | Every notification shows in the site and is duplicated by email as the delivery table allows, and email must work through a real mail provider such as Gmail when configured. Mailpit capture stays the default so development never emails real people. |
| D-08 | Owner instruction, 2026-11-08 | Deliver stage 11 administration: complete management of users, organizers, events, bookings, subscriptions and dictionaries. Pull requests are created by the agent and merged by the owner. Q-05 remains open. |
| P-06 | Source interpretation | A corporate subscription belongs to the purchasing user and covers multiple places; it is not a new company account or transferable shared login. A wider multi-account company pool would need a new requirement. |

## Q-01: Reversing points that have already been spent — approved

Source: sections 7.5.2, 7.8.2 and BR-06/BR-23. Confirmation awards points immediately. Cancelling must reverse the original award once, while the spendable balance must never become negative. Clamping a reversal to the remaining balance would lose part of the obligation.

Proposal: keep a nonnegative available balance and a separate nonnegative reversal liability. Atomically reverse the exact original award; use available points first and record any shortfall as liability. New awards and restored redeemed points settle that liability before becoming available. Prevent redemption beyond available points. Keep the original award snapshot, reversal linkage and deduplication key so later multiplier changes cannot change the reversal. Lifetime-points accounting and the liability presentation need explicit approval; do not silently add a new transaction reason or change the published entity schema.

Example for approval: award 100, redeem 80 elsewhere, then cancel the award's booking. Available 20 becomes 0, liability becomes 80; a later award of 50 reduces liability to 30. Money refunds still happen in full. Existing unrelated bookings are not cancelled. Test cancellation/redemption races, double cancellation, redeemed-point restoration and worker retries.

Owner decision, 2026-11-08: clamp the reversal at zero instead of the liability proposal above. A reversal deducts `min(originalAward, availableBalance)`; the unrecoverable remainder is written off and recorded in the REVERSAL note. The ledger delta is the amount actually deducted. Optional redemption, when added, must revisit restored-point accounting under this rule.

## Q-02: Which month owns free-visit quota? — approved

Source: sections 7.6.1 and 7.8.1 refer to the current calendar month, without identifying booking time or session time.

Proposal: use the session's calendar month in Europe/Kyiv. Reserve quota at creation with the booking's immutable pricing snapshot; each place consumes one visit. Release the reservation exactly once on REJECTED/CANCELLED/EXPIRED. Serialize reservations for a user and month. If a session moves to a different month, retain the original reservation and price for existing bookings; recalculate only after explicit user rebooking. This follows price snapshot protection but needs approval for the quota treatment. Show the current month's usage and future reservations separately.

Owner decision, 2026-11-08: approved as proposed. Free visits belong to the session's calendar month in Europe/Kyiv, are reserved at creation (one per place) and return once on REJECTED/CANCELLED/EXPIRED. A later session move keeps the original reservation and price.

## Q-03: Booking exactly 30 minutes before the start — approved

Source: section 7.5.1 uses a strict greater-than condition; BR-04 allows a start no earlier than the configured boundary, which reads as inclusive.

Owner decision for stages 05-07: use the inclusive rule `startsAt - serverNow >= bookingCutoff`. Exactly 30 minutes is allowed with the default setting. Capture server time after obtaining reservation locks; never trust the browser clock. Verify below, at and above the boundary. This explicitly resolves the conflict with the strict wording in source section 7.5.1.

Status: approved by the owner on 2026-11-08. Q-01, Q-02 and Q-04 were approved later the same day; Q-05 remains open.

## Q-04: Exhausted corporate subscriptions and card eligibility — approved

Source: section 7.7 gives exhausted subscriptions EXHAUSTED status; section 7.8.1 reverts the card when the last active corporate subscription ends. It is unclear whether exhausting visits counts as ending eligibility before expiry.

Proposal: an unlocked corporate card requires at least one unexpired ACTIVE corporate subscription with usable visits. Exhausting the last such subscription reverts the card to the level derived from lifetime points; another eligible corporate subscription preserves it. If cancellation restores visits before expiry, restore subscription eligibility and recompute the card. An expired subscription stays expired even when visits are returned. Admin-locked cards never change automatically. Existing booking prices and original points awards remain snapshots.

Owner decision, 2026-11-08: retain corporate benefits until calendar expiry instead of the exhaustion proposal above. An unlocked card is CORPORATE while any corporate subscription of the user is unexpired, whether ACTIVE or EXHAUSTED. When the last one expires, the card returns to its base level. Admin-locked cards never change automatically.

## Q-05: Administrator list scope

Source: section 7.4.7 marks the dedicated administrators list as [S], while section 11 includes Administrators in the screen map. Proposal: administrator creation form/API and protection of active administrators remain mandatory; the separate list tab remains optional, following the explicit [S] marking. Confirm before closing final acceptance.

## Stage 04 design decisions (historical)

Accounts reuse salted scrypt, pg transactions and strict DTOs. The worker implements welcome delivery only, using a PostgreSQL outbox and a Mailpit SMTP Adapter. Profiles persist initial card metadata without implementing loyalty behavior. Optional registration logos upload after automatic sign-in; upload failure keeps the account intact. Inactive dictionary selections can be retained only by their existing owner. General idempotency/payment/job behavior remains planned. Exact dependency versions and image digests are pinned, and CI checks the public backend at an exact commit. SMTP acceptance before a crash/transaction rollback remains a possible external duplicate-delivery window. None of these choices approves Q-01 through Q-05.

## Stage 05-07 implementation decisions

Reservations lock event ? session ? booking before payment rows; active capacity is derived from booking state, so terminal transitions release it without a second counter write. A database schedule row persists expiry/completion cadence; retrying does not repeat terminal transitions. The simulator holds the reservation locks across its bounded 1-2 second delay and rechecks the deadline before recording success. Payment response replay lasts 24 hours; only an HMAC fingerprint of canonical input is stored. The database holds a private idempotency key; backups must protect it. No PAN/CVV or holder is persisted.

Time/address revision counters preserve the exceptional cancellation right even if the organizer later changes the value back. Pending/card/free pricing is fixed at reservation time; subscriptions and loyalty remain unsupported until stages 08-09. Recommendation fallback currently counts all bookings per event within the user city; full recommendation/reporting acceptance remains stage 12. The outbox dispatcher now sends originating catalog/booking/payment notices as well as welcome mail. SMTP acceptance before transaction rollback still has the documented external duplicate window. These technical decisions approve none of Q-01/Q-02/Q-04/Q-05.

## Stage 09 implementation decisions

These ordinary assumptions implement the approved rules; none changes Q-05.

- Base level: each profile stores a non-corporate base level (STANDARD/PREMIUM). Accrual that brings lifetime points to the Premium threshold raises it; nothing lowers it automatically. Corporate eligibility, when present, takes precedence for unlocked cards. Lowering the threshold affects users at their next accrual.
- Lifetime points: a reversal reduces lifetime points by the full original award (the award is cancelled), never below zero, without downgrading the card. Administrator adjustments change only the spendable balance; lifetime points come from booking awards.
- Award inputs: the paid amount is the sum of successful payments for the booking; the multiplier is the card in effect at confirmation. The award is recorded on the booking and ledger and is never recalculated.
- Rounding: the card discount rounds half up to whole minor units. Points use exact decimal arithmetic with the floors of the source formula.
- Card assignment: an administrator can assign any level with a reason, recorded in assignment history. An unlocked assignment must agree with the automatic rules; otherwise it is rejected with a request to lock the card.
- Free access never applies to zero-price events, so no quota is consumed by them.
- Notifications: accrual, reversal, adjustment and upgrade notifications use the LOYALTY category and its single email preference (default off). The source distinguishes accrual email (off by default) from upgrade email (preference applies); that needs separate settings in the stage 10 notification matrix.
- Locking: booking work locks event, session and booking, then the member card, then a subscription. Booking jobs commit per booking to keep card locks short; lock conflicts are retried on the next worker interval.

## Stage 10 implementation decisions

None of these changes Q-05.

- Email transport: one SMTP adapter reads host, port, TLS and credentials from the environment. Without credentials and with a local host the connection is plain (Mailpit). With credentials or any other host the connection must be encrypted (STARTTLS, or implicit TLS on 465) and the certificate is verified. The sender is `SMTP_FROM`, defaulting to `SMTP_USER`. Gmail needs an app password.
- Delivery failures: a rejected message (permanent 5xx other than credential errors) is marked FAILED at once. Connection, timeout and credential errors are retried with backoff up to 300 seconds apart, up to `EMAIL_MAX_ATTEMPTS` (default 50, roughly four hours), then FAILED. A batch stops after the first temporary failure so a mail outage does not stall the worker. Logs record only the error code, never the recipient, subject or credentials. Duplicate delivery after a crash between acceptance and commit remains possible; the Message-ID is the notification ID.
- Email links: absolute, built from `APP_PUBLIC_URL` (default: the first allowed origin). Only site-relative links are used.
- Loyalty email defaults: points, reversal and adjustment emails follow the LOYALTY preference (default off). Card upgrade emails are sent while the preference has never been changed; once the user changes it, it applies to all loyalty emails. This satisfies the table's "off by default" for accrual and "preference applies" for upgrades with a single setting.
- Reminders: sent only to CONFIRMED bookings with a scheduled future session and only when the booking was made before the lead time (24 hours for the first, 2 hours for the second). The 24-hour reminder is skipped once the 2-hour one is due, so a delayed worker never sends both. Message text states the start time rather than a countdown.
- Organizer self-actions: an organizer is not notified of a cancellation it performed. Administrator edits, cancellations and moderation of an event notify the organizer in-app and by email; notices for administrator actions on organizer accounts arrive with the stage 11 account management.
- Chat: one conversation per user-organizer pair; starting an existing one returns it (200). Organizers start from a booking in any status. Both participants must be active to send, but history stays readable. Message order uses a per-conversation sequence assigned under the conversation row lock, so polling never skips a message. Read state is stored per message. Each message creates one MESSAGES notification; reading the conversation clears those notifications. Updates use polling (about 3 seconds in a thread, 8 seconds for header counts, paused in hidden tabs) as decided in P-05. Messages cannot be edited or deleted.
- Chat limits: 30 messages per sender per minute (429), enforced by the server.
- Sessions hold one CSRF token, so the browser serializes mutations; concurrent chat tests therefore use separate sessions.

## Stage 11 implementation decisions

None of these changes Q-05.

- Blocking versus deleting: blocking never cancels anything. Deleting a user cancels every PENDING, AWAITING_PAYMENT and CONFIRMED booking through the normal cancellation transition, so refunds, visit returns, point reversals and notifications are the same as for any cancellation. Finished (COMPLETED, REJECTED, EXPIRED, CANCELLED) bookings are untouched.
- Deleting an organizer cancels only events that still have a scheduled future session or an active booking, so finished events keep their real status. Cancelled events keep status CANCELLED; their plans are archived and purchased subscriptions remain as records. Plans are archived rather than refunded because subscription purchases are non-refundable.
- Visibility of a blocked organizer is derived from the account status, so its events keep their own status and reappear unchanged after unblocking. The public session list also no longer returns sessions of events that are not ACTIVE or whose organizer is not active.
- Deleted accounts keep their email address reserved (globally unique, history preserved); it cannot be registered again. Deleted accounts cannot be edited, blocked or unblocked, and repeating a deletion succeeds without effect.
- Notifications: organizers receive in-app and email notices for administrator edits, blocks, restorations and deletion, and for event edits, moderation and cancellation. Members receive the usual cancellation and refund notices when their bookings are cancelled by a deletion, including a deleted member (the refund notice matters financially). Members are not notified of contact edits or blocks, which the table in section 7.9 does not list.
- Contact edits cover email, name, phone, city and gender for users and email, name, type, phone, city, description and directions for organizers. Passwords, photos and notification preferences stay with the owner of the account.
- Audit: decisions are written in the same transaction as their effect to `admin_audit_log` (append-only by trigger) with the reason. Reading the log is not part of the contract; it is available in the database for investigation.
- Dictionaries: names are unique ignoring case; the code is derived from the name; a PATCH changes only the sent fields; a per-dictionary lock serializes edits so the last active value cannot be deactivated by two requests together.
- Concurrency: account deletions lock the account first, then events, sessions and bookings in the same order as booking operations; a payment racing a deletion ends cancelled with the charge refunded. A session holds one CSRF token, so concurrent requests in tests use separate sessions.

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
| P-04 | Contract defined; business calculations planned | JSON money uses integer UAH minor units; decimal rates use strings. Persist UTC instants and interpret calendar filters in Europe/Kyiv. This does not resolve Q-02 or Q-03. |
| P-05 | Proposed technical choice | Polling is sufficient for live chat and counters initially, if it meets the no-manual-reload requirement. Choose the interval and test stale/out-of-order responses; SSE remains an option. |
| P-06 | Source interpretation | A corporate subscription belongs to the purchasing user and covers multiple places; it is not a new company account or transferable shared login. A wider multi-account company pool would need a new requirement. |

## Q-01: Reversing points that have already been spent

Source: sections 7.5.2, 7.8.2 and BR-06/BR-23. Confirmation awards points immediately. Cancelling must reverse the original award once, while the spendable balance must never become negative. Clamping a reversal to the remaining balance would lose part of the obligation.

Proposal: keep a nonnegative available balance and a separate nonnegative reversal liability. Atomically reverse the exact original award; use available points first and record any shortfall as liability. New awards and restored redeemed points settle that liability before becoming available. Prevent redemption beyond available points. Keep the original award snapshot, reversal linkage and deduplication key so later multiplier changes cannot change the reversal. Lifetime-points accounting and the liability presentation need explicit approval; do not silently add a new transaction reason or change the published entity schema.

Example for approval: award 100, redeem 80 elsewhere, then cancel the award's booking. Available 20 becomes 0, liability becomes 80; a later award of 50 reduces liability to 30. Money refunds still happen in full. Existing unrelated bookings are not cancelled. Test cancellation/redemption races, double cancellation, redeemed-point restoration and worker retries.

Decision needed: approve the separate-liability model and how lifetime points and the UI represent it. Blocks reversal behavior involving already-spent points; the issue becomes especially relevant to optional redemption.

## Q-02: Which month owns free-visit quota?

Source: sections 7.6.1 and 7.8.1 refer to the current calendar month, without identifying booking time or session time.

Proposal: use the session's calendar month in Europe/Kyiv. Reserve quota at creation with the booking's immutable pricing snapshot; each place consumes one visit. Release the reservation exactly once on REJECTED/CANCELLED/EXPIRED. Serialize reservations for a user and month. If a session moves to a different month, retain the original reservation and price for existing bookings; recalculate only after explicit user rebooking. This follows price snapshot protection but needs approval for the quota treatment. Show the current month's usage and future reservations separately.

Decision needed: approve session-month ownership and cross-month rescheduling behavior. Test month ends, DST, multiple future bookings, partial quota, cancellation and concurrent requests. Blocks free-access quota semantics.

## Q-03: Booking exactly 30 minutes before the start — approved

Source: section 7.5.1 uses a strict greater-than condition; BR-04 allows a start no earlier than the configured boundary, which reads as inclusive.

Owner decision for stages 05-07: use the inclusive rule `startsAt - serverNow >= bookingCutoff`. Exactly 30 minutes is allowed with the default setting. Capture server time after obtaining reservation locks; never trust the browser clock. Verify below, at and above the boundary. This explicitly resolves the conflict with the strict wording in source section 7.5.1.

Status: approved by the owner on 2026-11-08. Q-01, Q-02, Q-04 and Q-05 remain open.

## Q-04: Exhausted corporate subscriptions and card eligibility

Source: section 7.7 gives exhausted subscriptions EXHAUSTED status; section 7.8.1 reverts the card when the last active corporate subscription ends. It is unclear whether exhausting visits counts as ending eligibility before expiry.

Proposal: an unlocked corporate card requires at least one unexpired ACTIVE corporate subscription with usable visits. Exhausting the last such subscription reverts the card to the level derived from lifetime points; another eligible corporate subscription preserves it. If cancellation restores visits before expiry, restore subscription eligibility and recompute the card. An expired subscription stays expired even when visits are returned. Admin-locked cards never change automatically. Existing booking prices and original points awards remain snapshots.

Decision needed: approve exhaustion-based loss and restoration of eligibility, or retain corporate benefits until calendar expiry. Test concurrent last-visit use, restored visits, multiple subscriptions, expiry and admin locks. Blocks automatic corporate-card recalculation.

## Q-05: Administrator list scope

Source: section 7.4.7 marks the dedicated administrators list as [S], while section 11 includes Administrators in the screen map. Proposal: administrator creation form/API and protection of active administrators remain mandatory; the separate list tab remains optional, following the explicit [S] marking. Confirm before closing final acceptance.

## Further design decisions

Accounts reuse salted scrypt, pg transactions and strict DTOs. The worker implements welcome delivery only, using a PostgreSQL outbox and a Mailpit SMTP Adapter. Profiles persist initial card metadata without implementing loyalty behavior. Optional registration logos upload after automatic sign-in; upload failure keeps the account intact. Inactive dictionary selections can be retained only by their existing owner. General idempotency/payment/job behavior remains planned. Exact dependency versions and image digests are pinned, and CI checks the public backend at an exact commit. SMTP acceptance before a crash/transaction rollback remains a possible external duplicate-delivery window. None of these choices approves Q-01 through Q-05.

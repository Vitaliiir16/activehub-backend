# Decisions and open questions

Prepared on 2026-11-08. Proposals below are not implemented or approved business rules. Only the affected feature is held pending a decision; repository preparation can proceed.

## Recorded direction

| ID | Status | Direction and source |
|---|---|---|
| D-01 | Owner instruction | Use English in new documentation, code, UI, messages and seed display labels. This explicitly overrides the Ukrainian interface and validation text in source sections 3 and 10. Keep UAH and Europe/Kyiv. |
| D-02 | Owner instruction | Publish product engineering files only. Keep the original source archive local. The published English baseline is REQUIREMENTS.md and its source section references; the local `project.md` archive is byte-identical to the supplied source. |
| D-03 | Owner instruction | This delivery is preparation only. No functional modules, framework scaffold or placeholder API. |
| D-04 | Owner instruction | Commits, push and pull requests are authorized in both repositories; merge remains manual with the owner. No force push or history rewriting. Empty repositories start with a meaningful documentation commit on main. |
| D-05 | Fixed source constraint | Next.js REST API + TypeScript, separate React + TypeScript frontend, PostgreSQL and Docker Compose. No framework substitution. |
| P-01 | Proposed technical choice | Vite for the separate frontend. Select exact package and runtime versions during scaffolding and record the lockfiles and runtime policy. Installed Node is not a compatibility certification. |
| P-02 | Proposed technical choice | Backend-owned Compose, sibling frontend context, PostgreSQL-backed worker and outbox, local Mailpit, named database/uploads volumes. No Redis required initially. |
| P-03 | Proposed technical choice | Persist login sessions, preferably opaque tokens in secure HTTP-only cookies. Agree CSRF, cookie, origin and proxy behavior in the contract before implementing auth. |
| P-04 | Proposed technical choice | Store money in integer minor units or exact database decimal types, never binary floating-point. Persist UTC instants and interpret calendar boundaries in Europe/Kyiv. Final JSON representation belongs in OpenAPI. |
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

## Q-03: Booking exactly 30 minutes before the start

Source: section 7.5.1 uses a strict greater-than condition; BR-04 allows a start no earlier than the configured boundary, which reads as inclusive.

Proposal: use the inclusive rule `startsAt - serverNow >= bookingCutoff`, so exactly 30 minutes is allowed with the default setting. Use the same captured server time within the transaction and never trust the browser clock. Test one instant below, exactly at and above the boundary. This changes the strict wording in 7.5.1 and requires approval.

Decision needed: inclusive or strict boundary? Blocks only the final cutoff predicate and its acceptance tests.

## Q-04: Exhausted corporate subscriptions and card eligibility

Source: section 7.7 gives exhausted subscriptions EXHAUSTED status; section 7.8.1 reverts the card when the last active corporate subscription ends. It is unclear whether exhausting visits counts as ending eligibility before expiry.

Proposal: an unlocked corporate card requires at least one unexpired ACTIVE corporate subscription with usable visits. Exhausting the last such subscription reverts the card to the level derived from lifetime points; another eligible corporate subscription preserves it. If cancellation restores visits before expiry, restore subscription eligibility and recompute the card. An expired subscription stays expired even when visits are returned. Admin-locked cards never change automatically. Existing booking prices and original points awards remain snapshots.

Decision needed: approve exhaustion-based loss and restoration of eligibility, or retain corporate benefits until calendar expiry. Test concurrent last-visit use, restored visits, multiple subscriptions, expiry and admin locks. Blocks automatic corporate-card recalculation.

## Q-05: Administrator list scope

Source: section 7.4.7 marks the dedicated administrators list as [S], while section 11 includes Administrators in the screen map. Proposal: administrator creation form/API and protection of active administrators remain mandatory; the separate list tab remains optional, following the explicit [S] marking. Confirm before closing final acceptance.

## Further design decisions

Scaffolding must choose dependency versions, database access/migrations, password hashing, test tooling and CI commands. Contract work must choose route names, transport schemas, errors, paging, ordering, auth and idempotency semantics. These are planned decisions, not existing interfaces. Cross-repository CI access must be verified rather than assuming one repository's token can read another.

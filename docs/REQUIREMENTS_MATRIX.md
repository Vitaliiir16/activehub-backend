# Requirements and verification matrix

Rows below define acceptance scope. Product behavior remains **planned** except where the delivery evidence section explicitly records a completed subset. The English [baseline](REQUIREMENTS.md) preserves source references; only recorded owner overrides apply. Stage numbers refer to [DELIVERY_PLAN.md](DELIVERY_PLAN.md). Verification descriptions are future acceptance work unless linked to actual evidence. A grouped row requires every subcase, not a representative example.

## Delivery evidence

| Requirements | Delivered subset | Evidence | Still planned |
|---|---|---|---|
| M-001 through M-004, M-100 | Stage 00 domain and whole-system modeling | [MODELING.md](MODELING.md), three PlantUML sources and locally rendered SVGs; PlantUML 1.2026.9 successful compilation; use-case ID inventory reviewed | All business behavior, actual GoF implementation and final source-to-model reconciliation |

## Mandatory scope

| ID | Source | Requirement | Stage | Verification to perform |
|---|---|---|---|---|
| M-001 | 1, 2, 17 | Domain analysis and sports-center coverage: venues, sections, trainers, profiles, bookings, subscriptions, loyalty and communications | 00, 13 | Compare every assignment capability to final workflows and this matrix |
| M-002 | 1.1, 12, 17 | Use Case diagram with all mandatory G/U/O/A/System use cases and include/extend relationships | 00, 13 | Model review against full section 12; keep System S1-S7 distinct from optional [S] |
| M-003 | 1.1, 6, 17 | Whole-system UML class diagram, entities, relationships, application services/layers | 00, 13 | Compare diagram to model and implemented symbols; update before acceptance |
| M-004 | 1.1, 13, 17 | Justified GoF selection, interactions, documented SOLID/GRASP | 00, 13 | Review real code/comment/README pattern links and behavioral benefit |
| M-005 | 3 | Node.js + TypeScript + Next.js REST API | 01, 03 | Check package/runtime config, API build and REST integration |
| M-006 | 3 | Separate React + TypeScript frontend | 01 | Check separate package/lockfile and successful frontend build |
| M-007 | 3, 6 | PostgreSQL persistence, shared uploaded-file storage | 02, 13 | Real database integration and restart preservation |
| M-008 | 3, 14 | One-command Compose; automatic migrations/required seeds | 02 | Clean startup, init ordering, health checks and idempotent restart |
| M-009 | 3, 10; D-01 | English UI/validation and new text; UAH; Europe/Kyiv | 01-13 | Locale/text audit, exact currency and timezone boundary cases |
| M-010 | 4, 6.1 | Exactly one role/account and globally unique email | 04 | Database constraints and cross-role duplicate registration race |
| M-011 | 4 | Guests only auth; signed-in catalog; role landing pages | 04-05 | Anonymous route/API denial and three role redirects |
| M-012 | 4 | USER-only purchase/book/loyalty; own organizer resources; admin management; no admin chat | 04-13 | Full allow/deny role/ownership matrix, including direct requests |
| M-013 | 5.1 | Seed 16 directions and 15 cities; add/rename/deactivate; no physical removal of referenced values | 02, 04, 11 | Compare all seed identities; referential/deactivation tests |
| M-014 | 5.1 | Dictionary-only city/direction, including user preferences; inactive values remain historical but not newly selectable | 04-05 | Reject arbitrary/inactive IDs; preserve historical displays |
| M-015 | 5.2 | All fixed enums, ANY wildcard, age informational, gender informational | 04-05 | Enumerated schema/client values; ANY filtering; no age/gender restriction |
| M-016 | 6 | All specified entities/attributes/relationships, timestamps and history | 02-13 | Migrations/model/class diagram review against all section 6 rows |
| M-017 | 6.2 | All event/session statuses; completed-event display derived from future sessions | 05-06 | Status/display cases for each state and no-future-session event |
| M-018 | 7.1 | Email/password login, indistinguishable credential errors, blocked denial, 7-day session, logout | 04 | Session/reload/expiry/logout/blocked tests |
| M-019 | 7.1 | Two-step registration, all USER and ORGANIZER fields, password confirmation | 04 | Form and server validation for each required/optional field |
| M-020 | 7.1 | Automatic login, welcome in-app/email, role redirect, organizer without moderation, no admin self-signup | 04, 10 | Complete signup flows, effects and forbidden ADMIN role input |
| M-021 | 7.1, 7.2.8, 7.3.5 | Password change requires current password; email change retains uniqueness | 04 | Wrong-current rejection and duplicate-email race |
| M-022 | 7.2.1 | Board ACTIVE/future/active organizer; five kind tabs, user-city default, all cities | 05 | Fixture-based visibility/tab/default filter checks |
| M-023 | 7.2.1 | Event card cover/title/direction/kind/city/next session/effective price/promo/places/organizer/skill/age | 05 | UI assertions including zero price and promotion expiry |
| M-024 | 7.2.1 | Full events visible/disabled, available-only filter, default page size 20 | 05 | Full/partial availability and page-boundary cases |
| M-025 | 7.2.1 | Preferred-direction upcoming city recommendations; popularity fallback without preferences | 05, 12 | Known fixtures for preferred/unset preferences and city isolation |
| M-026 | 7.2.2 | Full event details/gallery/location/price/organizer, kind-specific capacity and future sessions/booking | 05-06 | All displayed fields and HALL_RENTAL/TEAM_SEARCH wording semantics |
| M-027 | 7.2.2-3 | Organizer profile/catalog; required filters, active events/plans, optional phone, messaging with event reference | 05, 08, 10 | Signed-in detail/search and navigation flows |
| M-028 | 7.2.4 | Booking seats/comment/payment selection/breakdown/confirmation; eligible subscription selection | 06-09 | Complete card/free/subscription flows and field validation |
| M-029 | 7.2.5 | Booking list and month/week calendar, status colors, future/past/cancelled tabs | 06 | All statuses/dates in both calendar modes and list |
| M-030 | 7.2.5 | Booking filters/fields, timeline, breakdown/payment/deadline; pay/cancel/message actions | 06-10 | Each field/filter/action with authorized status and ownership |
| M-031 | 7.2.6 | Purchased subscription organizer/type/status/expiry/visits/unlimited/company | 08 | All plan types/statuses and purchase navigation |
| M-032 | 7.2.7, 7.12 | Card/benefits/balance/progress/history/month quota and user booking/attendance stats | 09, 12 | Known ledger/booking/quota fixture versus UI values |
| M-033 | 7.2.8 | All editable user profile fields, photo, preferred directions and email preferences | 04, 09-10 | Round-trip fields and downstream recommendations/targeting |
| M-034 | 7.2.9 | Bell/unread count, linked notification list, read one/all | 10 | Ownership, counts and read idempotency |
| M-035 | 7.3.1 | Own dashboard counters, active/future/new booking definitions, net month revenue/unread | 12 | Known fixtures including refunds and cross-organizer isolation |
| M-036 | 7.3.1 | New-request actions, upcoming sessions/availability, own offers/statistics, 30-day chart | 06, 12 | Approve/reject flows and chart/counter consistency |
| M-037 | 7.3.2 | Required event fields, optional promo/photos, sessions individually, default confirmation by kind | 05 | Each field/default and ACTIVE creation visibility |
| M-038 | 7.3.2, 7.9 | Event creation confirms to organizer and notifies matching users | 05, 10 | Creation effect and city/direction targeting |
| M-039 | 7.3.3 | Overview/sessions-bookings/edit tabs; capacity and user/payment/comment fields; status/date/user-name filters | 05-07 | All fields/filters, BR-08 redaction for noneligible statuses |
| M-040 | 7.3.3 | Organizer approve/reject/cancel-with-reason/message; pause/resume retains bookings | 06, 10 | State guards, visibility and retained active bookings |
| M-041 | 7.3.3 | Text/photos/skill/age editable; price/promo new-only; direction/city only without active bookings | 05-07 | Every edit permission and frozen price snapshot |
| M-042 | 7.3.3 | Changed time/address notifies all booked users and permits full refund until start | 06-10 | Change during normal cutoff then cancel; verify all compensation |
| M-043 | 7.3.3 | Capacity cannot shrink below reservations; active-booked session cannot be removed | 05-06 | Concurrent capacity edit/booking and deletion denial |
| M-044 | 7.3.3 | Event/session cancellation cascades full refund/notify; deletion warns then soft deletes with history | 06-11 | Mixed active/final bookings, confirmation UI and repeat cascade |
| M-045 | 7.3.4-6 | Own plan CRUD/archive; all organizer profile edits with unique email; chat/notifications | 04, 08, 10 | Own versus foreign plans/profile and persisted field round-trips |
| M-046 | 7.4.1 | Admin period 7/30/90/custom statistics dashboard | 12 | Period bounds/fixtures and ADMIN-only access |
| M-047 | 7.4.2 | Admin users: exact ID/name/email/phone/city/status/registration-date search, paging/sort/details | 11 | Every independent/combined filter and detail section |
| M-048 | 7.4.2 | Edit contacts not password; set locked tier; adjust points with reason; block/unblock/delete | 09, 11 | Privilege/validation, ledger reason, lock and cascade checks |
| M-049 | 7.4.3 | Organizer ID/name/type/city/direction/status search/details/stats/edit/block/unblock/delete | 11-12 | Full filters; block hides and keeps bookings; delete compensates |
| M-050 | 7.4.3 | User deletion cancels/refunds active bookings and notifies organizers | 11 | Once-only mixed-booking cascade retaining history |
| M-051 | 7.4.4 | All events: ID/title/organizer/city/direction/kind/status/session-period filters and full details | 11 | Each/combined filter and cross-organizer admin view |
| M-052 | 7.4.4 | Admin event text/photo moderation, block/unblock/cancel/delete with organizer notification | 11 | Permissions/effects including cancellation/refund and history |
| M-053 | 7.4.5 | All-booking ID/status/user/organizer/event/period filters, cancel/refund/notify | 11 | Combined filters and idempotent cancellation |
| M-054 | 7.4.5-6 | Admin subscription view/archive, dictionary editing and all loyalty configuration | 09, 11 | Archive continuity and configuration validation/use |
| M-055 | 7.4.7 | First admin from environment; admin-only API and form creates another by email/password/name | 02, 04 | Clean seed/reseed and role-denied creation; form success |
| M-056 | 7.4.7 | Block other admins, no self block/delete, never remove last active admin | 04, 11 | Concurrent disable/delete and self-operation denial |
| M-057 | 7.5.1 | Active USER/event/organizer/scheduled session, cutoff, capacity, no duplicate user or hall booking | 06 | Every failed predicate and atomic successful reservation; Q-03 |
| M-058 | 7.5.1 | Reserve seats/price/visits and initial state based on mode and amount | 06-09 | MANUAL/AUTO x card/free/subscription cases and rollback |
| M-059 | 7.5.2 | All seven states; active occupy capacity; terminal states irreversible | 06 | Complete transition matrix with allowed/denied edges |
| M-060 | 7.5.2 | Organizer approve/reject; approval starts capped payment deadline | 06-07 | Paid/unpaid/free/subscription approval, optional rejection reason |
| M-061 | 7.5.2 | PENDING expiry at 48h/start; awaiting expiry at capped deadline; confirmed completion after end | 06, 10 | Captured time boundary tests and repeated worker execution |
| M-062 | 7.5.2 | User pending/awaiting cancellation anytime; confirmed normal cutoff or changed-event exception | 06-09 | Before/at/after 12h and changed-event until-start cases |
| M-063 | 7.5.2 | Organizer/admin/system cancel any active with required reason | 06-11 | All actors/statuses and rejected missing reasons |
| M-064 | 7.5.2 | Reject/cancel/expire release seats, refund paid money, restore visits/points, reverse award, notify once | 06-10 | Cross-module transaction rollback/retry/race; Q-01/Q-02 |
| M-065 | 7.5.3 | CONFIRMED display/details; user in-app/email and organizer notification | 06-10 | Card/free/subscription confirmation and duplicate-effect check |
| M-066 | 7.5.4 | TRAINING/SECTION/EVENT 1-10 seats; TEAM_SEARCH 1; hall whole slot unit 1 | 06 | Bounds and concurrent exclusivity; hall people capacity remains informational |
| M-067 | 7.5.5 | No overbooking/double payment/duplicate refund or resource restoration | 06-10 | Parallel requests using real PostgreSQL and retry fault cases |
| M-068 | 7.6 | Simulated card fields/format/expiry; success and decline test cards, other valid cards success, 1-2s | 07 | Test both specified cards, arbitrary valid, expired/invalid and simulated timing |
| M-069 | 7.6 | Failed attempt persisted; stays awaiting; retry only before deadline; last4 only stored | 07 | Retry/deadline checks and database/log redaction audit |
| M-070 | 7.6 | Receipt/breakdown, same-card full simulated refund/notify; zero/subscription bypass | 07-10 | Each outcome and no duplicate receipt/refund effects |
| M-071 | 7.6.1 | Immutable ordered base/promo -> free quota -> card discount -> optional points -> nonnegative due | 07-09 | Exact money/rounding and snapshot/promo-end cases; Q-02 |
| M-072 | 7.6.1 | Subscription skips free/discount/redemption steps, zero due and earns points | 08-09 | Ensure no quota consumption and correct original award |
| M-073 | 7.7 | ONE_TIME one visit/duration; MONTHLY limited/unlimited; CORPORATE company/minimum two/shared places | 08 | Every type's plan/purchase/booking constraints |
| M-074 | 7.7 | Card purchase activates immediately, no purchase refund, archived plans preserve purchases | 08 | Retry purchase and archive/continued-use tests |
| M-075 | 7.7 | Eligibility ACTIVE/session covered/visits/organizer/scope; debit per place; unlimited unchanged | 08 | Each eligibility failure, all-directions and selected-scope cases |
| M-076 | 7.7 | Visits restore once on reject/cancel/expire; EXHAUSTED/EXPIRED states | 08 | Last-visit concurrency, retry/expiry/return interactions; Q-04 |
| M-077 | 7.8.1 | Exactly one card; all tier defaults/admin configuration; premium threshold and corporate purchase | 09 | Tier seeds, eligibility and configurable benefits |
| M-078 | 7.8.1 | Upgrade after accrual, no point-based downgrade, corporate reversion, admin lock, upgrade notify | 09-10 | Threshold/negative adjustment/expiry/exhaustion/multiple corp plans; Q-04 |
| M-079 | 7.8.1 | Free access platform-funded; revenue zero, no organizer settlement | 09, 12 | Free booking totals/receipts and reporting fixture |
| M-080 | 7.8.2 | Every confirmed booking earns floor((base+floor(paid*rate))*multiplier), including free/subscription | 09 | Formula boundaries and exactly-once snapshot of actual award |
| M-081 | 7.8.2 | Cancellation reverses award/restores redeemed points; every balance change has reasoned ledger record; accrual notify | 09-10 | Ledger reconciliation/retry and spent-point scenario; Q-01 |
| M-082 | 7.9 | In-app always on; BOOKINGS email cannot disable; category settings and default-off accrual/chat emails | 10 | Preference/channel matrix and mandatory-email enforcement |
| M-083 | 7.9 | Development mail capture, object links, per-event/recipient/type uniqueness | 02, 10 | Viewer only, valid links, concurrent duplicate trigger/restart |
| M-084 | 7.9 | Promotion targeting city AND preferred direction; no preferences means no promotion | 05, 10 | Matching/mismatched/empty-preference recipients |
| M-085 | 7.9 | 24h/2h confirmed reminders once; skip 24h for bookings created too late | 10 | Boundary/retry/cancelled booking and restart tests |
| M-086 | 7.10 | USER-ORGANIZER only; unique conversation pair; user initiates; organizer requires current/past booking | 10 | Initiation, duplicate-pair race, role/ownership denial |
| M-087 | 7.10 | Text/event reference/time/read state, latest-first conversations and unread counts | 10 | Message/read ordering, counts and event card |
| M-088 | 7.10 | Live updates without manual reload; message notification; blocked cannot send; admin cannot read | 10 | Two-browser flow, blocked session and direct admin request denial |
| M-089 | 7.11 | AND filters in URL/share/reset, all lists paginated/sorted | 05-13 | Round-trip URLs, combinations, reset and every role list |
| M-090 | 7.11 | Board date/range/title case-insensitive/city/direction/kind/ANY skill+age/price/available filters | 05 | Known fixtures for every filter and combined boundaries |
| M-091 | 7.11 | Nearest-date default, price asc/desc, newest ordering | 05 | Stable page ordering on equal values and all sort modes |
| M-092 | 7.11 | Organizer type/direction/city/name; user booking status/period/title; organizer booking status/date/user | 05-06 | Each/combined filter in its appropriate list |
| M-093 | 7.12 | Admin totals, net payments and created-to-confirmed conversion | 12 | Exact values for chosen-period fixtures, refund and zero denominator |
| M-094 | 7.12 | Booking daily/status/direction/city/top10; event creation/kind/direction/city | 12 | All aggregation groups and time boundaries |
| M-095 | 7.12 | Registrations by day/role, user city/gender/tier; organizer own and user loyalty stats | 12 | Known fixtures, scope and timezone checks |
| M-096 | 8 | Jobs execute without user actions, persisted state and idempotent retry/restart | 02, 10 | Stop/restart worker mid-job and inspect deduplication records |
| M-097 | 8 | Minute expiry/completion/reminder jobs; hourly subscription expiry/promo handling; continuous email queue/failure status | 06-10 | Fake-clock/domain plus real worker scheduling checks for every job |
| M-098 | 11 | All mandatory screens, role-aware header/navigation/logout/bell/chat counts | 04-13 | Screen inventory and E2E navigation for all roles |
| M-099 | 11 | Responsive phone/desktop; loading/empty/error states on every page | 01-13 | UI review at both sizes and network/failure/empty fixtures |
| M-100 | 12 | All mandatory G1-G3/U1-U16/O1-O13/A1-A9/System S1-S7 behaviors | 00-13 | Use Case diagram and E2E crosswalk; optional extensions separated |
| M-101 | 14 | Automatic first-admin/dictionaries/loyalty seeds | 02 | Clean init and repeat init produce one logical seed set |
| M-102 | 14 | Optional switch for specified demo set and README credentials once available | 02, 13 | Off produces no demos; on creates requested users/types/events/plans/bookings/chats/notices |
| M-103 | 15 | Configurable timing/limits/page size/session lifetime and all administrator loyalty defaults | 02-13 | Compare every baseline 14-15 default and change configured values in tests |
| M-104 | 16 | Exclude real money/payouts/tax, ratings, maps, social/mobile/push/multilingual/guest catalog/waitlists/attachments/admin chat/ICS/age-gender enforcement | 00-13 | Scope and dependency review; deny forbidden access, no excluded feature claims |
| M-105 | 17 | Meaningful GitHub history, truthful README startup/environment/demo instructions and pattern index | 00-13 | Review commits and reproduce published instructions; actual pattern links |

## Mandatory business invariants

| ID | Source | Requirement | Stage | Verification to perform |
|---|---|---|---|---|
| BR-01 | 9 | Unique global email, noncombined roles | 04 | Cross-role duplicate email concurrency and role assignment |
| BR-02 | 9 | Capacity never exceeded under concurrency | 06 | Parallel last-seat claims against PostgreSQL |
| BR-03 | 9 | At most one active user booking/session | 06 | Duplicate simultaneous request, terminal prior booking allows new one |
| BR-04 | 9 | Active event/organizer, scheduled session, configured cutoff | 06 | All predicates plus below/equal/above boundary; Q-03 |
| BR-05 | 9 | Terminal states irreversible | 06 | Deny every outgoing terminal transition |
| BR-06 | 9 | Refund/visits/points restoration/reversal once per booking | 07-10 | Duplicate cancel, worker retry and race; Q-01 |
| BR-07 | 9 | User and organizer ownership isolation | 04-13 | Foreign-ID reads/writes across each resource |
| BR-08 | 9 | Organizer sees user contacts only on own active/completed bookings | 06, 11 | Redaction for rejected/cancelled/expired and foreign bookings |
| BR-09 | 9 | Soft deletion and preserved bookings/payments/points history | 05-13 | Cascade and post-deletion history checks |
| BR-10 | 9 | Last active admin preserved; no self block/delete | 04, 11 | Parallel last-admin operations and self denial |
| BR-11 | 9 | UAH with two decimals, nonnegative price/due | 07-09 | Exact arithmetic, rounding and minimum/maximum cases |
| BR-12 | 9 | Display time Europe/Kyiv | 01-13 | UTC input, DST, day/month boundary display |
| BR-13 | 9 | Board only active events with future sessions | 05 | Every event status, empty/past/future sessions |
| BR-14 | 9 | Event kind immutable | 05 | Reject direct kind update |
| BR-15 | 9 | Price edits do not change existing booking price | 05-09 | Snapshot before/after edit and refund |
| BR-16 | 9 | Active-booked session cannot be deleted | 05-06 | Delete denial; cancellation path works |
| BR-17 | 9 | ORGANIZER/ADMIN cannot create bookings | 06 | Direct forbidden calls by both roles |
| BR-18 | 9 | Chat only USER-ORGANIZER | 10 | Deny all other pair types and admin content access |
| BR-19 | 9 | One notice per triggering event/recipient/type | 10 | Concurrent event delivery and restart replay |
| BR-20 | 9 | Blocked login denied and active sessions invalidated | 04, 11 | Existing session fails immediately after block |
| BR-21 | 9 | Referenced dictionaries deactivate only | 04, 11 | Referenced delete denial, historic value retained |
| BR-22 | 9 | Payment deadline no later than session start | 06-07 | Short-lead manual approval and expiry boundary |
| BR-23 | 9 | Points never negative; spending within available balance | 09, 14 | Parallel redemption and cancellation of spent award; Q-01 |

## Mandatory notification cases

These rows supplement M-082 through M-085. Email preferences apply only as specified; both recipient and channel must be checked. Stage 10 includes regression of the originating stages.

| ID | Source | Trigger / recipients and channels | Stage | Verification to perform |
|---|---|---|---|---|
| N-01 | 7.9 | Registration: new account in-app/email | 04, 10 | One welcome per account |
| N-02 | 7.9 | New PENDING: organizer in-app/email | 06, 10 | Correct organizer only |
| N-03 | 7.9 | Request submitted: user in-app/email | 06, 10 | Correct user and booking link |
| N-04 | 7.9 | Confirmed/awaiting payment: user in-app/email | 06-07, 10 | Both resulting states and repeat delivery |
| N-05 | 7.9 | Rejected: user in-app/email with reason if supplied | 06, 10 | With/without reason |
| N-06 | 7.9 | Payment success: user in-app/email receipt, organizer in-app | 07, 10 | No organizer email from this trigger |
| N-07 | 7.9 | Payment failed: user in-app only | 07, 10 | No email; repeat-attempt event identity |
| N-08 | 7.9 | User cancels: organizer/user in-app/email including refund amount | 06-09, 10 | Both recipients and original amount |
| N-09 | 7.9 | Organizer/admin/event cancellation: user in-app/email | 06-11 | Each initiator and once-only cascade |
| N-10 | 7.9 | Expired: user in-app/email; organizer in-app for PENDING | 06, 10 | Both source states and correct organizer channel |
| N-11 | 7.9 | Changed time/address: booked users in-app/email | 05-06, 10 | All affected users and cancellation entitlement |
| N-12 | 7.9 | Session full: organizer in-app only | 06, 10 | Last-place transition, no email |
| N-13 | 7.9 | 24h/2h reminders: confirmed user in-app/email | 10 | Late booking skip and retry deduplication |
| N-14 | 7.9 | New event: matching city/preference users in-app/email | 05, 10 | No-preference and wrong-city exclusion |
| N-15 | 7.9 | New promotion: matching city/preference users in-app/email | 05, 10 | Category preference and target intersection |
| N-16 | 7.9 | Accrual: user in-app; email default off | 09-10 | Every award, no duplicate |
| N-17 | 7.9 | Card upgrade: user in-app/email | 09-10 | Admin lock/no upgrade and true upgrade |
| N-18 | 7.9 | Message: participant in-app; email default off | 10 | Correct other participant only |
| N-19 | 7.9 | Subscription purchase: user in-app/email | 08, 10 | Idempotent purchase |
| N-20 | 7.9 | Admin changes/blocks event/account: organizer in-app/email | 11 | Each specified action and subject link |

## Mandatory field validation

Every check is authoritative on the server and mirrored with clear English field errors where applicable.

| ID | Source | Constraint | Stage | Verification to perform |
|---|---|---|---|---|
| V-01 | 10 | Email format and uniqueness | 04 | Invalid format, duplicate and concurrent duplicate |
| V-02 | 10 | Password >=8 characters, letter and digit | 04 | Each missing condition and accepted boundary |
| V-03 | 10 | First/last names 2-50 | 04 | 1/2/50/51 character boundaries |
| V-04 | 10 | E.164 phone | 04 | Valid international and malformed values |
| V-05 | 10 | Organization name 2-100 | 04 | 1/2/100/101 boundaries |
| V-06 | 10 | Event title 3-120 | 05 | 2/3/120/121 boundaries |
| V-07 | 10 | Required description <=5000 | 05 | Empty/5000/5001 |
| V-08 | 10 | Session capacity integer 1-1000 | 05-06 | 0/1/1000/1001/fraction and reserved-capacity edit |
| V-09 | 10 | Price 0-100000 UAH, promotion < regular | 05, 07 | Range, exact decimals, equal/higher promotion |
| V-10 | 10 | Future start, end>start, no same-event overlap, <=60 sessions | 05 | Start/end boundary, overlap and 60/61 |
| V-11 | 10 | <=8 photos, jpg/png/webp, <=5 MB each | 05 | Count, size, actual file type and extension mismatch |
| V-12 | 10 | Booking comment <=300 | 06 | 300/301, optional empty |
| V-13 | 10 | Chat message 1-2000 | 10 | Empty/1/2000/2001 |
| V-14 | 10 | City/direction selected from dictionary | 04-05 | Unknown/deactivated IDs, historical references |

## Optional [S] scope

Only after mandatory acceptance. Required domain entities/ledger reasons and mandatory invariant checks remain required even when optional redemption is disabled.

| ID | Source | Optional feature | Stage | Verification to perform |
|---|---|---|---|---|
| S-01 | 7.1, 7.9, 11-12 | Password recovery, G4 screen/use case and email, one-hour single-use link, nondisclosing response | 14 | Existing/nonexisting email response equality; use/reuse/expiry |
| S-02 | 7.3.2 | Schedule generator from period/weekdays/time | 14 | Date/DST expansion, overlap and 60-session limits |
| S-03 | 7.3.3, 11-12 | Organizer-wide session calendar and O14 | 14 | Own-only dates/statuses, calendar navigation |
| S-04 | 7.2.4, 7.6.1, 7.8.2, 12 | Points redemption toggle/quantity, pricing step, rate/cap/balance/reservation/restoration | 14 | Rate/cap/available balance, concurrent spend, cancellation, Q-01 |
| S-05 | 7.7, 7.9, 8 | Three-day subscription expiry in-app/email reminder | 14 | Due boundary, once-only retry and correct recipient |
| S-06 | 7.11 | Explicit free-only event switch | 14 | Effective-zero matching and combined URL filters |
| S-07 | 7.4.7, 11 | Dedicated administrators list tab | 14 | ADMIN-only list/paging; confirm Q-05 conflict interpretation |

## Coverage and acceptance notes

Source sections 0-2 and Appendix A provide precedence and assignment crosswalks; they introduce no separate untracked product modules. Sections 3-8 map to M/N rows; section 9 maps one-to-one to BR rows; section 10 maps one-to-one to V rows; sections 11-13 map screens/use cases/pattern analysis; sections 14-17 map seeds/defaults/exclusions/artifacts. All seven distinct [S] capabilities and their repeated mentions are mapped above. Demo data is mandatory to support as an optional runtime switch, not an [S] feature.

Open rule decisions Q-01 through Q-04 and source ambiguity Q-05 are tracked in ASSUMPTIONS.md. They do not block preparation or unrelated stages, but unresolved affected behavior cannot be marked accepted. The stage 00 diagrams and all product evidence remain planned. Matrix completeness review is evidence of planning coverage only.

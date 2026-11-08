# ActiveHub product requirements

English delivery baseline, prepared 2026-11-08 from the supplied specification. Section numbers preserve source traceability. The source archive is retained locally as `docs/project.md`, unchanged. The owner's later instruction replaces Ukrainian UI, validation and new written material with English; currency remains UAH and displayed time remains Europe/Kyiv. Other business-rule proposals are pending in [ASSUMPTIONS.md](ASSUMPTIONS.md).

Every unmarked requirement is mandatory. [S] means optional, after all mandatory scope is accepted. Default values are configurable, not constants embedded in business logic. This document specifies intended behavior, not implemented features. The [matrix](REQUIREMENTS_MATRIX.md) assigns delivery stages and verification.

## 1-2. Purpose and deliverables

Build a sports and active-leisure marketplace covering the sports-center assignment: venues, sections and trainers; filters for sport, skill and age; dated bookings and confirmation; simulated payment; profile, preferences and history; one-time/monthly/corporate subscriptions; standard/premium/corporate loyalty cards and points; reminders, offers and bonus notifications. Multiple organizers generalize a network of sports centers without dropping those capabilities.

Required coursework artifacts: domain analysis, Use Case diagram, whole-system UML class diagram including entities/services/layers, justified GoF pattern selection and interactions, documented SOLID and GRASP applications, PostgreSQL persistence, REST API, functional user and administration interfaces, and GitHub history with small meaningful commits. README must ultimately explain Compose startup, environment variables and demo accounts. Diagrams must be updated to match actual implementation; they are not delivered by this preparation baseline.

## 3. Technical constraints

- Node.js, TypeScript and Next.js REST API backend.
- A separate React + TypeScript web application consuming REST.
- PostgreSQL for system data; uploaded files in shared container storage.
- One-command Docker Compose startup for database, backend and frontend, with automatic migrations and required seeds. A development mail viewer is allowed.
- English UI and validation text by explicit owner override; UAH with two decimal places; Europe/Kyiv display time.

## 4. Accounts and access

An account has exactly one role: USER, ORGANIZER or ADMIN. Email is unique across all accounts and roles.

| Capability | Guest | USER | ORGANIZER | ADMIN |
|---|---|---|---|---|
| Login / registration | Yes | No | No | No |
| Event board, events, organizers | No | Yes | Read only | Yes |
| Book, pay, buy/use subscriptions, loyalty | No | Yes | No | No |
| Manage events and subscription plans | No | No | Own only | All |
| Chat | No | Yes | Yes | No |
| Administration, dictionaries and loyalty settings | No | No | No | Yes |

Guests see authentication pages only. After login USER opens the event board, ORGANIZER its dashboard, ADMIN the administration dashboard. Server authorization must enforce role, ownership and account status on every relevant operation. Users see their own bookings, subscriptions, chats and notifications; organizers see their own events, plans and related bookings.

## 5. Dictionaries and enumerations

Administrators add, rename and deactivate directions and cities. Referenced entries are never physically removed. Inactive values remain on existing records but cannot be selected for new records. City/direction fields use dictionary selections, never free text.

Required direction seeds, expressed in English under the language override: Football, Basketball, Volleyball, Tennis, Table tennis, Yoga, Pilates, Fitness, CrossFit, Swimming, Running, Martial arts, Dance, Cycling, Climbing, Active leisure. Required cities: Kyiv, Lviv, Kharkiv, Odesa, Dnipro, Zaporizhzhia, Vinnytsia, Ivano-Frankivsk, Ternopil, Chernivtsi, Poltava, Cherkasy, Zhytomyr, Lutsk, Uzhhorod. Preserve the intended identities when selecting seed keys.

| Enumeration | Values |
|---|---|
| Organizer type | TRAINER, CLUB, VENUE, ORGANIZER |
| Event kind | TRAINING, SECTION, HALL_RENTAL, TEAM_SEARCH, EVENT |
| Skill | BEGINNER, INTERMEDIATE, ADVANCED, ANY |
| Age category | CHILDREN (under 12), TEENS (13-17), ADULTS (18+), SENIORS (55+), ANY |
| Gender | MALE, FEMALE, UNDISCLOSED |
| Loyalty level | STANDARD, PREMIUM, CORPORATE |
| Subscription type | ONE_TIME, MONTHLY, CORPORATE |
| Confirmation mode | AUTO, MANUAL |

An event with ANY skill or age matches every selection of that filter. Age is informational: no birth date or age checks. Gender is profile/statistics information, never an event restriction.

## 6. Domain model

All entities have id, createdAt and updatedAt. Soft deletion preserves related history (BR-09). This is a logical model; infrastructure records and exact storage schema remain to be designed.

| Entity | Required attributes and relationships |
|---|---|
| Account | Unique email, password hash only, role, ACTIVE/BLOCKED/DELETED status, lastLoginAt |
| UserProfile | Account 1:1; first/last name, phone, city, gender, photo, preferred directions, notification settings, loyalty level, cardLockedByAdmin, pointsBalance, lifetimePoints |
| OrganizerProfile | Account 1:1; organization name, type, at least one direction, city, description, optional public contact phone and logo |
| AdminProfile | Account 1:1; displayName, createdBy administrator or system |
| Direction / City | Name, isActive |
| Event | Organizer, title, description, kind, direction, city, address, skill, age, price, optional promoPrice/promoUntil, seatsPerSession, confirmationMode, ordered photos (up to 8), status |
| EventSession | Event, startsAt, endsAt, SCHEDULED/CANCELLED/COMPLETED status, seatsTotal, seatsTaken derived from active bookings |
| Booking | User, session, seats, status, optional comment, basePrice, discountBreakdown, amountDue, CARD/SUBSCRIPTION/FREE method, subscriptionUsed, pointsRedeemed, deadlineAt, cancelledBy/cancelReason; retain status timeline |
| Payment | Booking or subscription purchase, amount, SUCCEEDED/FAILED/REFUNDED status, cardLast4 only |
| SubscriptionPlan | Organizer, name, type, description, price, validityDays, visitsLimit (null unlimited), scope (all organizer events or selected directions), ACTIVE/ARCHIVED status |
| UserSubscription | User, plan, ACTIVE/EXPIRED/EXHAUSTED status, startsAt, expiresAt, visitsLeft (null unlimited), companyName for corporate only |
| LoyaltyLevelConfig | Three records; level, displayName, premium pointsThreshold, multiplier, discountPercent, freeDirections, freeVisitsPerMonth |
| LoyaltyRules | Single rules record; basePointsPerBooking, pointsPerUah, redeemRate, maxRedeemPercent |
| PointsTransaction | User, optional booking, signed delta, reason ACCRUAL/REDEEM/REVERSAL/REFUND_RESTORE/ADMIN_ADJUST |
| Conversation | Unique user/organizer pair, lastMessageAt |
| Message | Conversation, sender, text, optional event reference, readAt |
| Notification | Recipient account, type/category/title/body/link/readAt, emailStatus NONE/QUEUED/SENT/FAILED |

An organizer has many events and plans; an event has many sessions and photos; a session has many bookings; a user has many subscriptions, bookings and points transactions. Bookings have payment attempts and optionally one subscription. Conversations have many messages; accounts have many notifications. Role profiles are exclusive per account. Event statuses: ACTIVE, PAUSED, CANCELLED, BLOCKED, DELETED. Completed event display is derived from having no future sessions.

## 7.1. Authentication

Login uses email/password with the same error for incorrect email and password. Blocked accounts receive an account-blocked message and cannot sign in. Login persists across page reloads for 7 days by default; logout is available.

Registration has two steps: select seeker or service provider, then the appropriate form. USER fields: first/last name, email, password/confirmation, phone, city, gender. ORGANIZER fields: email, password/confirmation, organization/trainer name, type, one or more directions, city, contact phone; optional description/logo. Successful registration signs in automatically, sends welcome in-app/email notifications and opens the role home. Organizer registration requires no moderation. Administrators cannot self-register. Profile password changes require current and new password.

[S] Password recovery sends a single-use link valid for one hour; the response must not disclose whether an email exists.

## 7.2. User experience

### Board and discovery

Show ACTIVE events from active organizers with future sessions. Tabs cover all five event kinds and all events. Default city is the user's city, with an all-cities option. Cards show cover, title, direction, kind, city, next available session date/time, effective price (free if zero; promotion marker and crossed-out old price), remaining places, organizer, skill and age. Full events stay visible with a full marker and disabled booking; an available-places-only switch filters them. Default page size is 20.

Recommendations show upcoming events in the user's city matching preferred directions; without preferences use popular city events by booking count.

### Details and organizers

Event pages show gallery, title/description/kind/direction/skill/age, city/address, effective price, organizer name/type/logo/link and future sessions with start/end/free places and booking action. HALL_RENTAL capacity is shown as up to N people, TEAM_SEARCH as N participants wanted. A message action opens the organizer conversation with the event reference. Show purchasable organizer plans if present.

Organizer pages show name/type/logo/description/city/directions/optional public phone, active events/plans and messaging. Organizer catalog supports type/direction/city/name discovery. Public profile here means visible to signed-in permitted roles, not guest access.

### Booking, account and loyalty screens

Booking form has place count, optional organizer comment, card or eligible subscription selection, [S] redeem-points toggle/quantity, ordered price breakdown and confirmation action. The backend owns all calculations.

My bookings provides list and month/week calendar views with status colors; upcoming/past/cancelled tabs; status/period/event-name filters. Show event/date/time/places/status/amount/method. Details show status timeline, price breakdown, payment and payment deadline, with pay/cancel/message actions when allowed.

My subscriptions lists organizer/type/status/expiry/remaining visits or unlimited/company name. Loyalty shows card and benefits, balance, next-tier progress, transaction history, current-month free visits and user booking/attendance statistics. Profile edits first/last name, phone, city, gender, photo, email and password; preferred directions affect recommendations and promotions. Notification preferences control permitted email categories; in-app remains on. The header bell has unread count; notification list supports reading one/all and linked navigation.

## 7.3. Organizer experience

Dashboard uses only own data: total events (active/paused/completed), future sessions, active future bookings (PENDING/AWAITING_PAYMENT/CONFIRMED), new PENDING requests, current-month successful-payment revenue minus refunds, unread messages; new requests with approve/reject; upcoming sessions with availability; own proposals with sessions/bookings/occupancy; booking chart for last 30 days.

Create event: required title, immutable kind, dictionary direction/city, description, free-text address, skill/age (ANY allowed), seats, nonnegative price, confirmation mode and one or more sessions. Optional promotion price/end and up to eight ordered photos, first as cover. AUTO defaults for TRAINING/SECTION/EVENT; MANUAL defaults for HALL_RENTAL/TEAM_SEARCH. Add sessions individually. [S] Generate sessions using date range, weekdays and times. New event is ACTIVE immediately, with organizer confirmation and preference-targeted user notifications.

Management tabs: overview, sessions/bookings, edit. Show total/taken/free places and booking user name, contact data only per BR-08, places/comment/status/payment status. Filter by status/date/user name. Approve/reject PENDING; cancel active bookings with reason; message from booking. Pause hides the event without cancelling existing bookings; resume restores visibility. [S] Organizer-wide session calendar.

| Change | Rule |
|---|---|
| Title/description/photos/skill/age | Allowed at any time |
| Price/promotion | New bookings only; preserve existing snapshots |
| Direction/city | Only without active bookings |
| Session time/address with bookings | Notify booked users; they may cancel for full refund until session start, irrespective of normal cancellation cutoff |
| Reduce capacity | Never below reserved places |
| Remove session with active bookings | Forbidden; cancellation only |
| Cancel session/event | Cancel all active bookings, fully refund and notify |
| Delete event with future active bookings | Show explicit consequence warning; after confirmation cancel/refund and soft-delete, retaining history |

Organizers create/edit/archive their own subscription plans. Profile edits organization name/type/directions/city/description/contact phone/logo/password and email with uniqueness validation. Chat and notification center are required.

## 7.4. Administration

ADMIN-only dashboard: 7/30/90-day or custom-period statistics. All lists support pagination and sorting.

| Area | Required search, visibility and actions |
|---|---|
| Users | Exact ID; name/email/phone search; city/status/registration-date range. Details include profile/card/points/bookings/subscriptions. Edit contacts but not password; manually set and lock card; adjust points with reason; block/unblock/delete. |
| Organizers | ID/name/type/city/direction/status. Details include profile/events/stats; edit/block/unblock/delete. |
| Events | All organizers; ID/title/organizer/city/direction/kind/status/session-date range. Organizer-level details plus bookings; moderate text/photos, block/unblock/cancel/delete; notify organizer. |
| Bookings | All bookings; ID/status/user/organizer/event/period; cancel with refund and notifications. |
| Subscriptions | View plans/subscriptions and archive plans. |
| Dictionaries/settings | Add/rename/deactivate cities/directions; configure all loyalty parameters. |
| Administrators | Seed first administrator from environment. ADMIN-only API and UI form to create another by email/password/name. May block other administrators but not self or the last active administrator. [S] Dedicated administrators list tab, subject to Q-05. |

Blocking an organizer hides its events and prevents new bookings; existing bookings survive. Deleting an organizer cancels/refunds its events and notifies users. Deleting a user cancels/refunds active bookings and notifies organizers. Deletion is soft. Blocked accounts lose active login sessions (BR-20).

## 7.5. Booking rules

Creation requires active USER, ACTIVE event/organizer, SCHEDULED session, `startsAt - captured serverNow >= bookingCutoff` (inclusive, owner-approved Q-03; exactly 30 minutes is permitted by default), permitted seats and sufficient capacity, no other active booking by that user for that session, and no other active booking for HALL_RENTAL. Atomically reserve capacity, price snapshot, applicable subscription visits and [S] redeemed points; free quota also needs atomic accounting after Q-02. Subscription/loyalty effects remain stage 08-09 dependencies rather than being simulated in stages 06-07.

MANUAL starts PENDING. AUTO starts AWAITING_PAYMENT if positive card amount is due, otherwise CONFIRMED (zero price/subscription). Active states occupy places: PENDING, AWAITING_PAYMENT, CONFIRMED. Terminal states are irreversible: REJECTED, CANCELLED, EXPIRED, COMPLETED.

| Transition | Actor and condition |
|---|---|
| PENDING -> AWAITING_PAYMENT / CONFIRMED | Organizer approves; payment deadline starts then if needed |
| PENDING -> REJECTED | Organizer, optional reason |
| PENDING -> EXPIRED | System after 48 hours or at session start |
| AWAITING_PAYMENT -> CONFIRMED | Successful user payment |
| AWAITING_PAYMENT -> EXPIRED | System at payment deadline (60 minutes default, capped at start) |
| PENDING / AWAITING_PAYMENT -> CANCELLED | User at any time |
| CONFIRMED -> CANCELLED | User at least N hours before start (default 12), or changed-time/address exception until start |
| Any active -> CANCELLED | Organizer/admin/system event/session cancellation; reason required |
| CONFIRMED -> COMPLETED | System after session ends |

REJECTED/CANCELLED/EXPIRED releases capacity and returns visits/redeemed points; successful payments are fully refunded; original point awards are reversed. Each effect happens once and emits the specified notifications. Entering CONFIRMED displays confirmation details, notifies/emails the user and notifies the organizer. Payment retries cannot charge twice.

TRAINING/SECTION/EVENT allow 1-10 places per booking within availability. TEAM_SEARCH always uses one place. HALL_RENTAL always uses one booking unit, monopolizes the session, and displays informational people capacity separately. Concurrent requests must not overbook or duplicate an active user/session booking.

## 7.6. Simulated payments and pricing

No real money or payment provider. Form collects card number/holder/expiry/CVV; validate format and unexpired date only. Test card `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` declines; other valid cards succeed. Simulate 1-2 seconds. FAILED payment leaves AWAITING_PAYMENT and permits retry until deadline. Persist cardLast4 only; never full card number/CVV. Successful details show receipt, breakdown and payment data. Refunds are automatic/full to the same simulated card with notification. Zero-price and subscription bookings bypass payment form.

Snapshot price at creation in order: (1) effective event price (promotion if not expired) times seats; (2) card free directions, one visit per free place up to remaining monthly quota; (3) card percent discount on remainder; (4) [S] points at configured redemption rate and percent cap; (5) nonnegative amount due. Subscription selection skips steps 2-5 and sets zero due, while still earning points. Money is nonnegative with two decimal places.

## 7.7. Subscriptions

Organizer plans have price, duration, scope and visit policy. ONE_TIME has exactly one visit and validityDays from purchase. MONTHLY usually lasts 30 days with limited or unlimited visits. CORPORATE requires company name, visitsLimit at least two, arbitrary validityDays and supports multiple people by consuming places from a visit pool. It is purchased by a user, not a separate company login.

Purchase by simulated card creates ACTIVE subscription immediately; no subscription purchase refunds. Archived plans cannot be newly bought but existing subscriptions continue. Eligibility requires ACTIVE status, session within validity, enough visits, same organizer and matching all-events/direction scope. Booking creation reserves/debits one visit per place; unlimited has no decrement. REJECTED/CANCELLED/EXPIRED restores visits once. No visits means EXHAUSTED; elapsed time means EXPIRED. [S] Notify three days before expiry.

## 7.8. Loyalty

Exactly one card per user; administrators configure each level.

| Level | Eligibility | Defaults |
|---|---|---|
| STANDARD | Initial level | x1 points, 0% discount, no free access |
| PREMIUM | lifetimePoints >= 500 or admin assignment | x1.5 points, 5% discount, Swimming: four free visits/month |
| CORPORATE | Corporate subscription purchase or admin assignment | x2 points, 10% discount |

Automatic upgrade follows point accrual; no automatic downgrade due to point decreases. Corporate returns to points-based level when last active corporate subscription ends (exhaustion interpretation pending Q-04). Admin-assigned card with cardLockedByAdmin is not changed automatically. Notify upgrades. Platform-funded free access produces zero revenue; organizer settlement is outside scope.

Every CONFIRMED booking earns `floor((basePointsPerBooking + floor(amountPaid * pointsPerUah)) * cardMultiplier)`, including free/subscription bookings. Defaults are 10 base points plus one per 10 UAH. Cancelling after accrual reverses the original award and restores redeemed points, exactly once. Every balance change gets a PointsTransaction with reason and each accrual notifies. Spendable points cannot become negative; already-spent reversal conflict is pending Q-01. [S] Redemption uses redeemRate and maxRedeemPercent and cannot exceed available balance.

## 7.9. Notifications

In-app is always enabled. Each notification links its subject. Email is captured in a development viewer, never delivered to real recipients during development. Users can disable email for REMINDERS/PROMOTIONS/LOYALTY/MESSAGES, but BOOKINGS email is mandatory. Deduplicate by triggering event, recipient and type. LOYALTY accrual and MESSAGES email default off.

| Trigger | Recipient | Category | In-app | Email |
|---|---|---|---|---|
| Registration | New account | Unspecified | Yes | Yes |
| New PENDING request | Organizer | BOOKINGS | Yes | Yes |
| Request submitted | User | BOOKINGS | Yes | Yes |
| Confirmed / awaiting payment | User | BOOKINGS | Yes | Yes |
| Rejected with reason if given | User | BOOKINGS | Yes | Yes |
| Payment succeeds / receipt | User and organizer | BOOKINGS | Both | User only |
| Payment fails | User | BOOKINGS | Yes | No |
| User cancels | Organizer and user (refund confirmation) | BOOKINGS | Both | Both |
| Organizer/admin/event cancellation | User | BOOKINGS | Yes | Yes |
| Booking expires | User; organizer for PENDING | BOOKINGS | Both as applicable | User only |
| Time/address changes | Booked users | BOOKINGS | Yes | Yes |
| Session fills | Organizer | BOOKINGS | Yes | No |
| Reminder at 24h and 2h | CONFIRMED user | REMINDERS | Yes | Yes, preference applies |
| New matching event | Matching users | PROMOTIONS | Yes | Yes, preference applies |
| New matching promotion | Matching users | PROMOTIONS | Yes | Yes, preference applies |
| Points accrue | User | LOYALTY | Yes | Off by default |
| Card upgrades | User | LOYALTY | Yes | Yes, preference applies |
| Chat message | Other participant | MESSAGES | Yes | Off by default |
| Subscription purchased | User | BOOKINGS | Yes | Yes |
| [S] Subscription nearly expires | User | BOOKINGS | Yes | Yes |
| Admin changes/blocks event/account | Organizer | Unspecified | Yes | Yes |
| [S] Password recovery | Account | Unspecified | No | Yes |

New event/promotion targeting requires both matching city and a preferred direction; no preferences means no promotional messages. Skip the 24h reminder if booking was made less than 24h before start. Deliver each reminder once.

## 7.10. Chat

USER-ORGANIZER conversations only, unique per pair. User starts from an event/organizer; organizer may start only with a user who has or had a booking on its events, from the booking. Text is 1-2000 characters, with time/read state and optional event card. Sort conversations by last message; show unread counts in list/header. New messages appear without manual reload and create notifications. Blocked accounts cannot send; administrators cannot read chat content. No attachments.

## 7.11. Search and lists

Filters combine with AND, appear in page URL, support sharing and reset. All lists for all roles have pagination and sorting. Event filters: session date/range; case-insensitive title substring; dictionary city (user city default) and direction; event-kind tabs; skill/age with ANY wildcard; price range; available-only. Sort by nearest date (default), price ascending/descending, newest. [S] Explicit free-only switch. Organizer catalog: type/direction/city/name. User bookings: status/period/event name. Organizer bookings: status/session date/user name. Admin filters are detailed in 7.4, including exact user ID and full event filters.

## 7.12. Statistics

Admin chosen-period totals: users, organizers, active events, bookings, successful payments minus refunds, created-to-confirmed booking conversion. Booking breakdowns: daily, status, direction, city, top ten events. Event breakdowns: creation day, kind, direction, city. User breakdowns: registrations by day and role, city, gender, card tier. Organizer dashboard follows 7.3; user loyalty shows balance, bookings and attended events. Validate aggregates with known fixtures and keep organizer scope enforced.

## 8. Background processing

Jobs run without user actions, persist state in PostgreSQL, survive restarts and are idempotent. Every minute: expire PENDING (48h/start) and AWAITING_PAYMENT (deadline) with all effects; complete ended CONFIRMED bookings and sessions; send unique 24h/2h reminders. Hourly: expire subscriptions; [S] three-day expiry reminder; promotions cease dynamically after promoUntil. Continuously dispatch queued email and record failures in emailStatus. Restart/retry cannot duplicate business effects or messages.

## 9. Invariants

The matrix preserves BR-01 through BR-23 individually. They are part of the mandatory scope, including capacity and deduplication under concurrency, ownership and contact privacy, irreversible terminal states, full once-only compensation, soft history, last-admin protection, money/time rules, immutable event kind/price snapshots, session cancellation rules, chat role limits, blocked-session revocation, dictionary references and nonnegative points. Q-01/Q-03 identify actual wording conflicts rather than silently resolving them.

## 10. Validation

| Field | Rule |
|---|---|
| Email | Valid format and globally unique |
| Password | At least eight characters, at least a letter and a digit |
| First / last name | 2-50 characters |
| Phone | E.164 international format |
| Organization name | 2-100 characters |
| Event title | 3-120 characters |
| Event description | Required, at most 5000 characters |
| Session places | Integer 1-1000, with kind-specific booking rules |
| Price | 0-100000 UAH; promotion strictly below regular price |
| Sessions | Future start, end after start, no overlap within event, at most 60/event |
| Event photos | At most eight; jpg/png/webp; at most 5 MB each |
| Booking comment | At most 300 characters |
| Chat message | 1-2000 characters |
| City / direction | Existing eligible dictionary selections |

Server validation is authoritative. UI shows clear English errors beside the relevant fields under the owner's override.

## 11-13. Screens, Use Cases and design analysis

Screens: guest login/registration and [S] recovery; user board/event/organizer/catalog/bookings list+calendar/details/payment/subscriptions/loyalty/chat/notifications/profile; organizer dashboard/events/create+edit/detail+sessions+bookings/plans/chat/notifications/profile and [S] calendar; admin dashboard/users/organizers/events/bookings/subscriptions/dictionaries/loyalty/admin creation with [S] dedicated admin list (Q-05). Role-aware navigation, bell and chat counts, logout, responsive phone/desktop layouts and loading/empty/error states are required.

Use Case diagram must include source actors Guest, User, Organizer, Admin, System and these IDs: G1-G3 registration/login, [S] G4 recovery; U1-U16 board/search/event/organizer/book/pay/cancel/history/chat/buy subscription/subscriptions/loyalty/profile-and-preferences/notification-settings/notifications/password; O1-O13 dashboard/create/edit/sessions/pause-resume/cancel-delete/bookings/approve-reject/cancel/chat/plans/profile/notifications, [S] O14 calendar; A1-A9 statistics/users/organizers/events/bookings/dictionaries/loyalty/create admin/plans; System S1-S7 expiry/completion/reminders/email/accrual-and-upgrade/subscription-expiry/refunds. System S IDs are use-case identifiers, not optional markers. Show include/extend for price calculation, subscription choice and [S] redemption in booking, accrual on confirmation/payment, and refund/notification on cancellation.

Design analysis must evaluate loyalty policies, ordered price modifiers, subscription and event kinds, booking states, notification channels, payment methods, cancellation actors, composed filters, role access, complex event construction, statistics, shared settings and reactions to changes. Choose justified GoF patterns and explain interactions; do not add a pattern merely to label code. Proposed choices are in ARCHITECTURE.md. Final diagrams, comments and README pattern index must link actual implementation.

## 14-15. Seed data and defaults

Required startup seeds: first administrator from environment, all section 5 dictionaries, three loyalty levels and loyalty rules. Demo data is a separately enabled option: 3-5 users, four organizer types, about 12 varied events with future sessions/photos/promotions, all three subscription-plan types, bookings in multiple states, chats and notifications. Document actual demo credentials only once implemented; use no private credentials.

Defaults: booking cutoff 30m; confirmed cancellation cutoff 12h; payment deadline 60m capped at start; PENDING deadline 48h; reminders 24h/2h; photos/sessions limits 8/60; page size 20; login session 7d. These are configuration. Admin-configured loyalty defaults: base points 10, pointsPerUah 0.1, PREMIUM threshold 500, multipliers 1/1.5/2, discounts 0/5/10 percent, PREMIUM Swimming four visits/month, redemption 0.5 UAH/point capped at 30 percent. Optional redemption defaults do not make redemption mandatory.

## 16. Exclusions

No real payments, organizer payouts, tax/invoices, ratings/reviews, maps/geolocation/nearby search, social login, mobile apps, push notifications, multiple UI languages, guest catalog access, waiting lists, chat attachments/admin chat reading, ICS calendar integration, gender restrictions or age verification.

## 17. Delivery evidence

Acceptance requires mandatory matrix entries linked to actual checks, the Use Case and class diagrams, source-linked pattern documentation with SOLID/GRASP analysis, persisted PostgreSQL behavior, complete role interfaces, Compose startup and restart checks, truthful README instructions and meaningful Git history. Optional features cannot substitute for missing mandatory features. Preparation documents alone do not constitute product acceptance.

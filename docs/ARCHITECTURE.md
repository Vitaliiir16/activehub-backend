# Architecture and design analysis

ActiveHub is a modular monolith: Next.js REST adapters, cohesive TypeScript application functions, pure pricing/seat rules and PostgreSQL persistence, with a separate React frontend and worker. The [class diagram](diagrams/classes.svg) uses module stereotypes for function groups and type/SQL stereotypes for persisted records. These are real modules and types, not invented runtime service classes.

## Layers and real symbols

| Responsibility | Actual implementation |
|---|---|
| Transport and authorization | src/app/api route exports delegate through accounts/http.handler; accounts/security.actor and csrf enforce role, active session and origin |
| Accounts and profiles | accounts/service.register, login, applyProfile, changePassword and setAdminStatus; images.ts decodes owned uploads |
| Catalog and construction | marketplace/catalog.createEvent creates an event and its sessions in one transaction; photos.ts validates and orders images |
| Booking coordination | marketplace/bookings.previewBooking, createBooking, lockBooking and transition own price/reservation/state/history coordination |
| Payments and compensation | marketplace/payments.payBooking and payment-records.refundBooking; the simulator keeps only last4 |
| Subscription terms and visits | marketplace/subscriptions.purchaseSubscription, reserveVisits and returnVisits; immutable snapshots and a booking-keyed return ledger |
| Loyalty and pricing | loyalty/pricing.priceBooking and pointsAward are pure; loyalty/ledger.quoteBooking, accruePoints, releaseLoyalty and syncCard persist effects |
| Communications | marketplace/core.notify writes in-app/outbox atomically; communications/chat owns conversations, sequence/read state and access |
| Administration | administration/accounts, dictionaries and subscriptions reuse owning modules and append audit decisions |
| Statistics | statistics/organizer.organizerDashboard and platform.platformStatistics use owner/period-scoped SQL aggregates |
| Infrastructure | database transactions; email-outbox.dispatchNextEmail; reminder-jobs.runReminderJobs; booking-jobs.runBookingJobs; scripts/worker.ts |

## Invariants and failure boundaries

Authentication locks the account/session; business operations then lock event, session, booking, member card and subscription as required. Active booking rows determine occupied places. Unique partial indexes protect duplicate active reservations and exclusive halls; terminal booking transitions are guarded in SQL. Money is integer UAH minor units and decimal rates use exact arithmetic. Price, award, subscription terms and free-quota month are snapshots.

Cancellation returns free quota and subscription visits, reverses the original points award under approved Q-01, refunds a successful charge, records history and enqueues notifications within the transaction. Unique ledger/refund/event keys and idempotency response records prevent repeated effects. A preview holds the required pricing locks but reserves no resources; final creation recalculates atomically. The browser cannot supply amounts or owners.

PostgreSQL scheduling and outbox rows survive restarts. Booking jobs commit per booking; reminder keys prevent duplicate notices. SMTP retries use a stable Message-ID and bounded backoff. A crash after SMTP acceptance and before the database commit can still duplicate external delivery; the design does not promise universal exactly-once SMTP.

## Implemented GoF patterns and interaction

| Pattern | Concrete roles and purpose |
|---|---|
| Strategy | SeatPolicy is the contract; ordinary, single and hall objects are strategies selected by seatPolicy in marketplace/policies.ts. The booking coordinator delegates seat rules while PostgreSQL serializes availability. |
| Chain of Responsibility | PriceStep passes PriceContext to its next handler; PromotionStep, FreeAccessStep and CardDiscountStep apply the mandatory order in loyalty/pricing.ts. Subscription pricing takes the explicit bypass path. |
| Adapter | PaymentGateway is the target port; SimulatedCardGateway maps the simulated outcome/last4 in marketplace/payment-gateway.ts. No real payment service is called. |
| Adapter | MailTransport is the delivery port; SmtpMailTransport adapts nodemailer and classifies SMTP errors in infrastructure/mail.ts. The outbox dispatcher receives this port. |

The [sequence diagram](diagrams/booking-patterns.svg) follows the real collaboration: route and coordinator, seat strategy, price chain, transaction, confirmation/compensation and committed outbox dispatch. Each implementation has a concise English pattern comment; the README contains search commands.

Alternatives were evaluated rather than added for pattern count. Loyalty levels and subscription eligibility use configuration and ordinary cohesive functions. Booking states use a transition table and SQL trigger, not GoF State. Direct notification insertion/outbox polling is not Observer. Composed SQL filters are parameterized query construction, not a claimed Composite. Event construction needs no separate Builder; shared settings and a connection pool are not labelled Singleton. Cancellation actors reuse the same transition service rather than introducing Command classes. Statistics remain scoped SQL functions rather than an artificial Facade.

## Concrete SOLID and GRASP examples

- SRP / High Cohesion: pricing.ts computes values, ledger.ts persists awards/quota and email-outbox.ts delivers committed messages; HTTP mapping stays in handler.
- OCP / Polymorphism: PriceStep.then links another compatible modifier without changing the arithmetic in prior handlers. Optional redemption is not implemented or claimed.
- LSP: SeatPolicy implementations share validate(seats) and exclusive; the coordinator can use any selected policy through that contract. Mail transports share send(mail) and a classified failure contract.
- ISP: PaymentGateway exposes charge; MailTransport exposes send. Neither is a universal application service interface.
- DIP / Protected Variations: dispatchNextEmail accepts MailTransport; worker.ts chooses SmtpMailTransport. Payment orchestration currently constructs the simulated adapter directly; full dependency injection is not claimed.
- Information Expert: reserveVisits owns validity/scope/balance decisions, quoteBooking owns benefits, and transition owns legal status changes and compensation.
- Controller: Next routes delegate use cases to application functions and enforce transport/security through a shared wrapper.
- Creator: catalog.createEvent constructs the owned sessions inside the same event transaction.
- Low Coupling / Indirection: administrator deletion and worker expiry call the same booking compensation functions used by owner actions.
- Pure Fabrication: the outbox dispatcher and audit module keep delivery/retry and technical decision records cohesive without adding those duties to domain records.

## Persistent demonstration data

scripts/lib/demo.seedDemo runs only with explicit validated configuration. demo_seed_runs records one cohort per namespace under the initializer advisory lock. Existing accounts/settings are never replaced. Dates are relative to that cohort's creation; images are generated in shared uploads. Business helpers produce points, quotas and cancellation effects for sample history. A fresh namespace provides fresh dates without destroying the previous cohort.

The real implementation remains function-oriented TypeScript with explicit SQL; it is not presented as a complete repository abstraction or an idealized framework-independent domain layer. Acceptance scope and unverified boundaries are in [FINAL_ACCEPTANCE.md](FINAL_ACCEPTANCE.md).

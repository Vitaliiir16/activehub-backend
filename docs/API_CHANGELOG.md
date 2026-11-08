# API change history

## 0.6.0 - Communications

Implemented the chat operations: list conversations, find or start a conversation, list and send messages, and mark messages read. There are 112 operations: 84 implemented and 28 planned. Administrators are denied every chat operation. A user starts a conversation from an organizer or an event; an organizer only from a booking (or a user) that has or had a booking on its events. A user-organizer pair has one conversation, so starting again returns it with 200 (a new conversation returns 201).

Messages are 1-2000 characters, ordered gap-free per conversation, and may carry an event card. Poll for new messages with `afterId`; `readAt` shows when the other participant read a message. Both participants must be active to send, and sending is limited to 30 messages per minute (429). Additive response fields: `Conversation.counterpartName` and `lastMessageText`, `Message.eventTitle` and `ConversationPage.unreadTotal`. A new message creates a MESSAGES notification for the other participant; reading the conversation marks those notifications read.

Notification behavior now covers the whole delivery table: reminders (REMINDER_24H and REMINDER_2H, once each, skipped when the booking was made after that lead time), administrator edits, cancellations and moderation of an event notify the organizer in-app and by email, and organizers are not notified of their own cancellations. Email follows the category preference: BOOKINGS and account messages always, REMINDERS and PROMOTIONS by default, LOYALTY points and MESSAGES off by default. Card upgrade emails are sent until the user changes the LOYALTY preference once. Emails are rendered from one template with an absolute link and are delivered by the worker through the configured SMTP server (Mailpit by default); the notification `emailStatus` reports QUEUED, SENT or FAILED.

## 0.5.0 - Loyalty

Implemented own loyalty summary and points ledger, administrator level/rules configuration, card assignment with lock and points adjustment. There are 112 operations: 79 implemented and 33 planned. Approved owner decisions are now listed per operation in `x-decisions`; Q-05 remains in `x-open-questions`.

Booking creation snapshots the ordered price: effective promotion price, card free access, card percentage discount (half-up to whole minor units), nonnegative due. Free visits count against the session's calendar month in Europe/Kyiv (Q-02), one visit per place, and return once on REJECTED/CANCELLED/EXPIRED. Subscription payment skips the card steps. A booking that becomes CONFIRMED earns `floor((basePointsPerBooking + floor(paidUah * pointsPerUah)) * multiplier)` once, using the card at confirmation; cancellation reverses that recorded award once. A reversal never deducts more than the available balance (Q-01); its note records any unrecovered remainder. Lifetime points decrease by the original award, but cards are never downgraded because points decrease.

Purchasing a corporate subscription sets an unlocked card to CORPORATE. The card stays CORPORATE until the last corporate subscription expires, even after its visits are exhausted (Q-04), then returns to its base STANDARD/PREMIUM level. Administrator-locked cards never change automatically. Administrator adjustments cannot make the balance negative and change only the spendable balance.

Additive response fields: `Booking.pointsAwarded` (null before confirmation) and `PointsTransaction.note`. `pointsRedeemed` stays zero because optional redemption is not implemented. Loyalty notifications use the LOYALTY category and its email preference.

## 0.4.0 - Subscriptions

Implemented organizer plans and public purchasable plans; user subscription purchase/read/list; immutable term snapshots and direction display names; CARD/SUBSCRIPTION booking choice. Failed purchase attempts create no subscription. UUID request keys replay purchases; only last4 and an HMAC fingerprint are persisted. Visits are reserved per place under a subscription row lock and returned once through a booking-keyed ledger. Archived plans do not invalidate purchases. Subscription purchases have no refund route. Hourly expiry is persisted; current expiry also gates reads/use. Corporate loyalty and Q-04 remain stage 09. No optional expiry notices.

## 0.3.0 - 2026-11-08

Implemented stages 05–07: authenticated organizers/events/sessions/photos and recommendations, owned catalog management, booking lists/details/decisions/cancellation and simulated card attempts/receipts/refunds. There are 112 operations: 62 implemented and 50 planned. The two new read operations serve authenticated event photos and organizer logos. Other administrative screens, subscriptions, loyalty, chat and recovery remain planned.

Added optional trainer names, booking action/changed-details flags and refunded-at receipts. Until stages 08–09, booking creation accepts CARD only, with zero-price bookings becoming FREE; subscriptionUsedId is null and pointsRedeemed is zero. These values do not claim implemented benefit calculations. Strict DTOs reject role, price and subscription injection. Q-03 uses the approved inclusive cutoff; other open questions remain unresolved.

UUID idempotency keys replay successful mutation responses for 24 hours; changed payloads conflict. Payment fingerprints use HMAC, not stored card input. A declined payment returns a persisted FAILED attempt with HTTP 201; intentional retry requires a new key. New keys cannot charge a confirmed/refunded booking. Catalog changes preserve booking price snapshots and use revision counters for changed-time/address cancellation rights.

## 0.2.0 - 2026-11-08

Implemented stage 04 account registration/login/session/logout, own role-specific profiles, password changes, notification preferences, validated owned images, dictionaries, welcome notification reading and ADMIN-only creation/blocking. Twenty-one route operations now match implemented OpenAPI status; 89 remain planned. Added /api/media/{id} for authenticated owner image reads.

Profile patches use strict schemas chosen from the session role. Administrator display-name edits are supported. Organizer registration omits the former planned logoId: the optional logo is uploaded after automatic sign-in, preserving the created account on upload failure. Dictionary includeSelected=true is authenticated and preserves only the caller's inactive selections. Current login passwords accept 1-256 characters for generic credential checking; new passwords retain the required policy. Added documented 413 errors.

Implemented cookie/CSRF/origin enforcement and persisted rate limits. Registration welcome records and mail outbox are transactional; only welcome delivery is enabled in the worker. Booking/payment/subscription/loyalty/chat operations and optional recovery remain planned. Q-01 through Q-05 remain open.

## 0.1.0 - 2026-11-08

Introduced the OpenAPI foundation for authentication, dictionaries, profiles, discovery, organizer management, bookings, simulated payments, subscriptions, loyalty, messaging, notifications and administration. All business operations are planned; no handler exists for them.

Implemented `GET /api/health` returns a database-aware readiness response with `Cache-Control: no-store` and `X-Request-ID`. Unavailable PostgreSQL or missing migration produces the documented 503 error envelope. This adds `database: ready` to the original scaffold health response.

Defined planned cookie sessions, CSRF/origin checks, access scopes, errors, pagination, filters, integer minor-unit money, UTC instants and idempotency. Q-01 through Q-05 remain unresolved. See [API_CONVENTIONS.md](API_CONVENTIONS.md) for boundaries and synchronization.

Review added cross-event organizer session queries and administrator access to an organizer's aggregate statistics. User cancellation accepts an optional reason; organizer/administrator cancellation still requires one. These are planned contract definitions only.

# Communications review

Manual and automated checks for notifications, email, reminders and chat.

## Run

From the backend directory: `node scripts/create-local-env.mjs` once, then `docker compose up --build --wait`. Open the site at http://localhost:8080 and the captured mail at http://localhost:8025. Migration 009 applies automatically and keeps existing data.

## Manual checks

1. Register a user and an organizer in two browser windows. The user's Notifications page shows the welcome notification and Mailpit shows the welcome email; the header bell shows the unread count.
2. As the organizer, create an activity. As the user, open it, choose Message organizer, send a text. Within a few seconds the organizer's header shows an unread message badge without reloading; open Messages, read and reply. The user sees the reply and, under their own message, Read.
3. Book the activity. Each step creates a notification in the site and the emails described in the notification table (Mailpit). Cancel and check the refund notice.
4. In the profile, turn Messages email on and send another message: an email now arrives. With it off only the in-app notification is created.
5. Reminders: bookings confirmed more than 24 hours ahead receive a reminder once about 24 hours and once about 2 hours before the start. Set REMINDER_FIRST_SECONDS and REMINDER_SECOND_SECONDS to small values in `.env` to see them quickly.

## Real email

See Email in the README. Run the `check-mail.ts` command there after adding the variables; it prints whether the connection and credentials are accepted and sends one test email. Never commit `.env`.

## Automated

`npm run test:communications` (Node tests for settings and templates run in `npm test`) needs an isolated database, Mailpit and ACTIVEHUB_TEST_WRITES=true; it dispatches mail and reminders itself, so stop the worker first. It covers: the notification table by recipient, channel and preference; reminders; promotions; loyalty email defaults; rendered and delivered email with outage, permanent failure and attempt exhaustion; chat rules, concurrency, blocked accounts and rate limit. The browser test tests/chat.spec.ts in the frontend covers live chat and unread badges.

## Limits

A live Gmail account was not available; the encrypted, authenticated path was checked against a local server that requires STARTTLS and a login. Subscription near-expiry and password recovery emails are optional [S] rows and not implemented. SMTP acceptance followed by a crash before the database commit can duplicate one email. Chat uses polling, not push.

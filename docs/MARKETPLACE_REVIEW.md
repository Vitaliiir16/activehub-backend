# Catalog, bookings and payments

Stages 05–07 deliver authenticated discovery, owned events/sessions/photos, reservations and simulated card payments. Subscription visits, loyalty pricing/awards/quota and their cancellation compensation remain unfinished until stages 08–09. Chat, reminders and the complete communication matrix remain stage 10 work. No real money moves.

## Start

From `activehub-backend`, with the sibling frontend checked out:

```powershell
node scripts/create-local-env.mjs
docker compose up --build --wait
```

Generate `.env` only once. Open http://localhost:8080 and Mailpit at http://localhost:8025. Existing database volumes are migrated in place; no reset is needed. Administrator credentials remain in `.env`.

## Manual check

1. Register an organizer. Open **Manage events**, create an activity with a future session, select automatic confirmation and enter a positive UAH price. Add photos; change cover/order and edit the session. Times use Europe/Kyiv.
2. In another browser session register a user in the same city. Find the activity through Activities, open its details and reserve a place. The backend records the price snapshot and payment deadline.
3. Pay with `4242 4242 4242 4242`, any holder, a future expiry and a three-digit test CVV. Inspect the receipt, reload and cancel at least 12 hours before the session. The receipt becomes refunded and availability increases once.
4. Use `4000 0000 0000 0002` to decline. The reservation remains awaiting payment and accepts a new attempt before its deadline. Free activities confirm without a payment form.
5. Create a MANUAL activity. Submit a request; use organizer Bookings to approve or reject it. Contacts disappear for rejected/cancelled/expired bookings.
6. Create a paid activity two hours ahead. A confirmed booking cannot normally be cancelled now. Change its address or session time; the user then has a full-refund cancellation right until the current session start. Event/session cancellation also cancels active bookings and refunds successful payments.
7. Check My bookings and its week/month calendar. Filter state is in the URL. Pause/resume an event and confirm that existing bookings survive. Remove only sessions without active bookings; delete an event with a reason and confirm that booking/payment history remains.

## Automated evidence and limits

`npm.cmd run test:marketplace` starts the built production API and uses a real initialized PostgreSQL database. It requires `ACTIVEHUB_TEST_WRITES=true`, database variables and `APP_ORIGINS` matching the smoke-server origin. Use an isolated database: it creates identifiable fixtures and moves only those fixture deadlines/session times. It never cleans unrelated data.

The suite covers the paid/refund flow, MANUAL decisions, free bookings, declined/retried payments, persisted expiry/completion, competing last-place/hall/duplicate-user requests, repeated effects, role/ownership/CSRF denial, frozen prices, capacity/delete guards, changed-time/address refunds and event/session cascades. The exact cutoff predicate is checked below/at/above the boundary; real HTTP checks use small margins either side because request transport cannot guarantee an exact millisecond. Worker deadline tests advance fixture database records, rather than changing the application clock or waiting 48 hours.

Frontend `tests/marketplace.spec.ts` proves organizer creation → user discovery → reservation → payment → reload → cancellation → refunded receipt through the real stack. It runs once on desktop Chromium; existing account checks remain enabled on desktop/mobile in CI. Local verification does not claim a complete filter/field/transition matrix, calendar date/DST coverage, broad visual review, multiple browser engines, load testing or SMTP crash-window exactly-once delivery.

Q-03 is approved as inclusive. Q-01, Q-02, Q-04 and Q-05 remain open. A final acceptance claim across visits, points, quota and all notifications must wait for the later stages.

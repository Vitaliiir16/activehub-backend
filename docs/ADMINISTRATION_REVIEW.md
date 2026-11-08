# Administration review

Manual and automated checks for the administration area (stage 11).

## Run

From the backend directory run `docker compose up --build --wait` (migration 010 applies automatically and keeps data). Open http://localhost:8080 and sign in with `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from `.env`. Register a user and an organizer in other browser windows to have something to manage.

## Manual checks

1. **Users:** open Users, search by name, email, phone fragment, city, status and registration dates, then reset. Open a user, edit the last name and confirm the new name; the form has no password field.
2. **Block:** block the user with a reason. The user's window loses its session and sign-in shows that the account is blocked; their bookings are still listed under Bookings. Unblock to restore access.
3. **Delete a user** who has a paid booking: all active bookings become Cancelled, the payment shows Refunded in the user's history, the organizer receives a notification, and the account appears as Deleted in the search. Repeating nothing else changes.
4. **Organizers:** block an organizer. Its events disappear from the activity list for other users, new bookings are refused, and an existing booking can still be paid. Unblock to restore it. Delete an organizer to cancel and refund its upcoming events.
5. **Events and bookings:** find an event in any status, moderate it (edit text, remove a photo, block, cancel) and cancel a booking from the booking list. The organizer or member is notified.
6. **Dictionaries:** add, rename, deactivate and reactivate a city or direction. A deactivated value disappears from registration and event forms but stays on existing records, and the last active value cannot be deactivated.
7. **Subscriptions:** archive a plan; new purchases stop, existing purchases keep working.

## Automated

`npm run test:administration` (needs an isolated database, Mailpit and ACTIVEHUB_TEST_WRITES=true; stop the worker first) checks access control, every search filter, contact edits, block versus delete, once-only compensation under two concurrent administrators, a payment racing a deletion, organizer block and delete, dictionaries with the last-active guard, plan archiving and the append-only audit log. The browser test tests/administration.spec.ts in the frontend drives the same flows through the screens.

## Limits

Platform statistics and organizer statistics (stage 12) and the optional administrator list (Q-05) are not implemented. The audit log is stored but there is no screen or endpoint to read it. Browser coverage is desktop only; the screens were also reviewed at phone width. Photo removal is wired but not covered by a browser upload test.

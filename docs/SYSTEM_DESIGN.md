# System Design Write-up

## 1. Double-booking prevention

Booking happens in two steps so the UI can show a live "available slots"
list without a single global lock. Step one: the instant a patient picks a
slot, the server opens a transaction, re-checks (with a row lock) that no
confirmed appointment or other active hold exists for that
`(doctorId, slotStart)`, and if clear, inserts a `SlotHold` row with a short
TTL (default 5 minutes, `SLOT_HOLD_TTL_SECONDS`). Step two: when the patient
submits the symptom form, the server re-validates the hold (must still be
`active` and unexpired, and must belong to the requesting patient) inside
another transaction, then creates the `Appointment` row.

The transaction/row-lock check is a *soft* guarantee - it closes the obvious
race window, but the real backstop is a **database-level unique index** on
`appointments(doctorId, slotStart)` scoped to `WHERE status='confirmed'`
(a partial index, supported by both Postgres and modern SQLite). Two
requests that somehow both pass the application check will still collide at
the database layer, and the loser gets a clean 409 response ("this slot was
just taken") instead of a silent double-booking. This two-layer approach
(hold + hard constraint) means correctness doesn't depend on getting the
application logic perfectly race-free - the schema itself is the final
authority.

Expired holds are swept by the same cron tick that sends appointment
reminders, flipping them to `expired` so their slots become bookable again
without needing a customer-facing cleanup action.

## 2. Doctor leave conflict handling

When an admin marks a doctor on leave for a date (`POST
/admin/doctors/:id/leave`), the handler runs a single transaction that: (a)
records the `DoctorLeave` row, (b) finds every `confirmed` appointment for
that doctor on that date with a row lock, (c) flips each to
`cancelled_leave_conflict`, and (d) writes a `Notification` row for each
affected patient - all inside the same transaction. This matters because it
makes "the appointment is cancelled" and "we owe the patient an email"
atomic: if the transaction rolls back, neither happens; if it commits, both
are durably recorded, so a crash between "cancel the appointment" and
"queue the email" is impossible by construction.

Calendar cleanup (deleting the Google Calendar event for both patient and
doctor) happens *after* the transaction commits and is deliberately
best-effort - a slow or failed Google API call never risks leaving the
appointment cancellation half-applied, since the source of truth (DB state +
queued notification) is already safe.

## 3. Slot hold mechanism

The `SlotHold` table exists specifically to bridge the gap between "patient
clicked a time" and "patient finished the symptom form" - a window that can
last anywhere from a few seconds to a few minutes, during which the slot
must not be visible as available to other patients. Holds carry an
`expiresAt`; `getAvailableSlots()` excludes any slot with an active,
unexpired hold in addition to excluding confirmed appointments. If a patient
abandons the flow, the hold simply expires and the slot silently reopens -
no cleanup action, no dangling reservation. If they complete it, the hold is
flipped to `confirmed` in the same transaction that creates the appointment,
so a hold can never be "double-spent" into two appointments.

## 4. Notification failure handling

Emails are never sent synchronously inside a request handler. Every email
we intend to send is first written to a `notifications` "outbox" table
(status `pending`), ideally in the same transaction as the triggering event
(booking, cancellation, leave conflict) so the business event and the
"we owe a notification" record can't drift apart. A separate cron-driven
worker (`emailRetryJob`) picks up `pending`/`failed` rows on a fixed
interval, attempts delivery via Nodemailer, and updates `status` to `sent`
or `failed` (incrementing `attempts`). Once `attempts` reaches
`maxAttempts` (default 5), the row is marked `dead_letter` so it stops
retrying but remains inspectable rather than silently vanishing. This
means an SMTP outage delays notifications rather than losing them, and the
API response to the user is never blocked or slowed by mail server latency.
The same graceful-degradation principle applies to the LLM calls (retry +
timeout, then `aiStatus='failed'` with the raw data still shown to the
doctor/patient) and to Google Calendar sync (per-user, per-appointment
`calendar_events` rows record success/failure independently, so one side's
OAuth disconnect never affects the other side's calendar or the booking
itself).

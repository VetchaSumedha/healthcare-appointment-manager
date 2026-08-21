# Healthcare Appointment & Follow-up Manager

A full-stack clinic platform with separate portals for patients, doctors, and
an admin. Patients book appointments and submit symptoms in advance; doctors
get an AI-generated pre-visit summary and can submit post-visit notes that
become a patient-friendly summary; both sides get email + Google Calendar
sync.

## Tech stack

| Layer      | Choice                                                        |
|------------|----------------------------------------------------------------|
| Backend    | Node.js, Express, Sequelize ORM                                |
| Database   | SQLite by default (zero setup) - swap to Postgres via `DATABASE_URL` |
| Frontend   | React 18 + Vite, React Router, Axios                          |
| Auth       | JWT, bcrypt password hashing, role-based middleware            |
| LLM        | Anthropic Claude API (`@anthropic-ai/sdk`)                     |
| Email      | Nodemailer (SMTP) - swap for SendGrid/Mailgun by changing the transport |
| Calendar   | Google Calendar API v3, OAuth 2.0                              |
| Jobs       | `node-cron` in-process (reminders, medication reminders, email retry) |

## Project structure

```
healthcare-appointment-manager/
  backend/
    src/
      config/db.js            # Sequelize connection (SQLite or Postgres)
      models/                 # Sequelize models + associations
      middleware/              # auth (JWT), error handler
      services/                # llmService, emailService, calendarService, slotService
      controllers/              # route handlers
      routes/                   # Express routers
      jobs/                     # cron background jobs
      server.js                 # app entry point
      seed.js                   # creates demo admin + doctor
    .env.example
    package.json
  frontend/
    src/
      api/client.js             # axios instance with JWT injection
      context/AuthContext.jsx
      pages/                    # Login, Register, PatientDashboard, BookAppointment,
                                 # DoctorDashboard, AdminDashboard
      App.jsx, main.jsx, styles.css
    package.json
    vite.config.js
  docs/
    SYSTEM_DESIGN.md
  README.md (this file)
```

## 1. Local setup

### Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env: at minimum set JWT_SECRET and ANTHROPIC_API_KEY.
# SMTP_* and GOOGLE_* can stay as placeholders for local testing -
# the app degrades gracefully (emails/calendar just fail and get logged).
npm run seed     # creates admin@clinic.com / Admin@123 and dr.smith@clinic.com / Doctor@123
npm start        # or `npm run dev` with nodemon
```

The API listens on `http://localhost:5000`. `GET /health` should return `{"status":"ok"}`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to
`localhost:5000` (see `vite.config.js`).

## 2. Environment variables (`.env.example`)

All variables are documented inline in `backend/.env.example`. Key ones:

- `JWT_SECRET` - long random string, required.
- `DATABASE_STORAGE` - path to the SQLite file (default `./data/database.sqlite`). Set `DATABASE_URL` instead to use Postgres in production.
- `ANTHROPIC_API_KEY`, `LLM_MODEL` - Claude API credentials/model.
- `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` - outgoing email.
- `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI` - Calendar OAuth (see section 5).
- `SLOT_HOLD_TTL_SECONDS` - how long a slot hold lasts before it expires (default 300s = 5 min).
- `REMINDER_CRON`, `EMAIL_RETRY_CRON`, `MEDICATION_REMINDER_CRON` - cron schedules for background jobs.

## 3. Database schema

All tables use UUID primary keys. Core entities:

- **users** - `id, name, email, passwordHash, role(patient|doctor|admin), phone, isActive`
- **doctor_profiles** - `id, userId (1:1 -> users), specialisation, slotDurationMinutes, workingHours (JSON per weekday), bio`
- **doctor_leaves** - `id, doctorId, date, reason` - unique on `(doctorId, date)`
- **slot_holds** - `id, doctorId, patientId, slotStart, slotEnd, expiresAt, status(active|confirmed|expired|released)` - the temporary reservation used during the booking flow
- **appointments** - `id, patientId, doctorId, slotStart, slotEnd, status(confirmed|cancelled_by_patient|cancelled_by_doctor|cancelled_leave_conflict|completed|no_show)` - **unique partial index on `(doctorId, slotStart)` WHERE `status='confirmed'`** is the hard double-booking guarantee
- **symptom_forms** - `id, appointmentId (1:1), symptomsText, aiSummary (JSON: urgency/chiefComplaint/suggestedQuestions), aiStatus, aiError`
- **visit_notes** - `id, appointmentId (1:1), doctorNotes, prescriptionText, prescriptionStructured (JSON), aiPatientSummary, aiStatus, aiError`
- **notifications** - `id, userId, recipientEmail, type, subject, body, relatedAppointmentId, status(pending|sent|failed|dead_letter), attempts, maxAttempts, lastError, scheduledFor, sentAt` - the outbox table (see design doc)
- **calendar_events** - `id, appointmentId, userId, googleEventId, status(created|updated|deleted|failed), lastError`
- **google_tokens** - `id, userId (1:1), accessToken, refreshToken, expiryDate`
- **medication_reminders** - `id, visitNoteId, patientId, medication, dosage, timesPerDay, startDate, durationDays, nextReminderAt, active`

Associations are defined in `backend/src/models/index.js`.

## 4. API reference

Base URL: `/api`. All routes except `auth/register` and `auth/login` require
`Authorization: Bearer <token>`.

### Auth
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Patient self-registration |
| POST | `/auth/login` | public | Returns `{ token, user }` |
| GET | `/auth/me` | any | Current user profile |

### Admin
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/admin/doctors` | admin | Create a doctor (user + profile) |
| GET | `/admin/doctors` | admin | List all doctors |
| PATCH | `/admin/doctors/:id` | admin | Update specialisation/hours/slot length |
| POST | `/admin/doctors/:id/leave` | admin | Mark a date as leave; cancels conflicting appointments + notifies patients |
| GET | `/admin/doctors/:id/leave` | admin | List a doctor's leave days |

### Doctors (search + portal)
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/doctors?specialisation=` | any | Search doctors |
| GET | `/doctors/:id` | any | Doctor profile |
| GET | `/doctors/:id/slots?date=YYYY-MM-DD` | any | Available slots for a date |
| GET | `/doctors/me/appointments` | doctor | Doctor's own appointment list (with symptom form + AI summary) |

### Appointments
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/appointments/hold` | patient | Place a temporary hold on a slot |
| POST | `/appointments/confirm` | patient | Confirm booking from a hold + symptom text |
| GET | `/appointments/mine` | patient | Patient's own appointments |
| POST | `/appointments/:id/cancel` | patient/doctor/admin | Cancel an appointment |
| POST | `/appointments/:id/reschedule` | patient | Move an appointment to a new held slot |
| POST | `/appointments/:appointmentId/visit-note` | doctor | Submit post-visit notes + prescription |
| GET | `/appointments/:appointmentId/visit-note` | any | Read the visit note / AI summary |

### Calendar
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/calendar/connect` | any | Returns Google consent URL |
| GET | `/calendar/oauth/callback` | public (Google redirect) | Stores tokens, redirects to frontend |

## 5. LLM prompts used

**Pre-visit summary** (`llmService.generatePreVisitSummary`):
> "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: `<symptoms>`"

The system prompt constrains the model to return only a JSON object of shape
`{urgency, chiefComplaint, suggestedQuestions[3]}`, which is parsed and
stored on `symptom_forms.aiSummary`.

**Post-visit summary** (`llmService.generatePostVisitSummary`):
> "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: `<notes>`"

Both calls retry up to `LLM_MAX_RETRIES` times with backoff and a hard
timeout (`LLM_TIMEOUT_MS`). On failure, `aiStatus` is set to `failed` with
`aiError` populated - the appointment/visit-note is never blocked by an LLM
outage, and the doctor/patient sees a plain "AI summary unavailable" message
instead of raw symptoms/notes.

## 6. Google Calendar setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Google Calendar API**.
2. Configure the OAuth consent screen (External is fine for testing;
   add your test Google account as a test user).
3. Create an **OAuth 2.0 Client ID** (type: Web application).
   - Authorized redirect URI: `http://localhost:5000/api/calendar/oauth/callback`
     (match `GOOGLE_REDIRECT_URI` in `.env`, updating the host for production).
4. Copy the Client ID/Secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. In the app, an authenticated user calls `GET /api/calendar/connect` to get
   a consent URL, visits it, and Google redirects back to the callback route,
   which stores `accessToken`/`refreshToken` in `google_tokens`.
6. From then on, booking/rescheduling/cancelling an appointment automatically
   creates/updates/deletes an event on that user's primary calendar. If a
   user hasn't connected Calendar, the sync step is skipped silently
   (recorded as `calendar_events.status='failed'` with a clear reason) and
   never blocks the booking itself.

## 7. Deployment (free-tier friendly)

- **Backend**: Render / Railway - set all `.env` vars as environment
  variables in the dashboard, add a `DATABASE_URL` (Render/Railway both offer
  free Postgres) so data isn't lost on redeploy, since SQLite on most free
  hosts lives on an ephemeral filesystem.
- **Frontend**: Vercel / Netlify - set `VITE_API_BASE` or rely on same-origin
  proxying if you serve both from one Render service; otherwise point the
  axios `baseURL` at your deployed backend URL and update `CLIENT_URL` in the
  backend `.env` to your frontend's deployed URL (used for CORS + Calendar
  OAuth redirects).
- Run `npm run seed` once against the deployed database to create the
  initial admin account, then create real doctors from the admin portal.

## 8. Notes on production hardening

This is a complete, functioning scaffold - for a production rollout you'd
additionally want: input validation (e.g. `zod`/`joi`), rate limiting on
auth routes, refresh tokens, migrations instead of `sequelize.sync()`,
structured logging, and a process manager or queue (e.g. BullMQ/Redis)
in place of in-process `node-cron` once you run multiple server instances.

const { google } = require('googleapis');
const { GoogleToken, CalendarEvent } = require('../models');

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(state) {
  const oauth2Client = makeOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // needed to get a refresh_token
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state,
  });
}

async function handleOAuthCallback(userId, code) {
  const oauth2Client = makeOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  await GoogleToken.upsert({
    userId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
  });
  return tokens;
}

async function getClientForUser(userId) {
  const tokenRow = await GoogleToken.findOne({ where: { userId } });
  if (!tokenRow) return null; // user hasn't connected Google Calendar - caller should skip gracefully

  const oauth2Client = makeOAuthClient();
  oauth2Client.setCredentials({
    access_token: tokenRow.accessToken,
    refresh_token: tokenRow.refreshToken,
    expiry_date: Number(tokenRow.expiryDate),
  });

  oauth2Client.on('tokens', async (tokens) => {
    // Persist refreshed access tokens so we don't re-prompt the user
    const updates = { accessToken: tokens.access_token };
    if (tokens.refresh_token) updates.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) updates.expiryDate = tokens.expiry_date;
    await tokenRow.update(updates);
  });

  return oauth2Client;
}

/**
 * Create a calendar event for a given user (patient or doctor) if they have
 * connected Google Calendar. Failures are caught and recorded on the
 * CalendarEvent row with status='failed' rather than thrown - calendar sync
 * is a nice-to-have, never a reason to fail a booking.
 */
async function createEventForUser({ userId, appointmentId, summary, description, start, end, attendeesEmails = [] }) {
  try {
    const auth = await getClientForUser(userId);
    if (!auth) {
      return CalendarEvent.create({ appointmentId, userId, status: 'failed', lastError: 'Google Calendar not connected' });
    }
    const calendar = google.calendar({ version: 'v3', auth });
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(end).toISOString() },
        attendees: attendeesEmails.map((email) => ({ email })),
        reminders: { useDefault: true },
      },
    });
    return CalendarEvent.create({ appointmentId, userId, googleEventId: event.data.id, status: 'created' });
  } catch (err) {
    return CalendarEvent.create({ appointmentId, userId, status: 'failed', lastError: err.message });
  }
}

async function updateEventForUser({ userId, appointmentId, start, end }) {
  const existing = await CalendarEvent.findOne({ where: { appointmentId, userId, status: ['created', 'updated'] } });
  if (!existing || !existing.googleEventId) return null;
  try {
    const auth = await getClientForUser(userId);
    if (!auth) return null;
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.patch({
      calendarId: 'primary',
      eventId: existing.googleEventId,
      requestBody: {
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(end).toISOString() },
      },
    });
    existing.status = 'updated';
    existing.lastError = null;
    await existing.save();
    return existing;
  } catch (err) {
    existing.status = 'failed';
    existing.lastError = err.message;
    await existing.save();
    return existing;
  }
}

async function deleteEventForUser({ userId, appointmentId }) {
  const existing = await CalendarEvent.findOne({ where: { appointmentId, userId, status: ['created', 'updated'] } });
  if (!existing || !existing.googleEventId) return null;
  try {
    const auth = await getClientForUser(userId);
    if (!auth) return null;
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId: 'primary', eventId: existing.googleEventId });
    existing.status = 'deleted';
    await existing.save();
    return existing;
  } catch (err) {
    existing.lastError = err.message;
    await existing.save();
    return existing;
  }
}

module.exports = {
  getAuthUrl,
  handleOAuthCallback,
  createEventForUser,
  updateEventForUser,
  deleteEventForUser,
};

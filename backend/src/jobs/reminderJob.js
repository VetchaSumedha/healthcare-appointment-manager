const cron = require('node-cron');
const { Op } = require('sequelize');
const { Appointment, DoctorProfile, User, Notification } = require('../models');
const { queueNotification, reminderEmail } = require('../services/emailService');
const { releaseExpiredHolds } = require('../services/slotService');

const REMINDER_WINDOW_HOURS = 24; // send a reminder ~24h before the appointment

async function sendUpcomingReminders() {
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

  const upcoming = await Appointment.findAll({
    where: { status: 'confirmed', slotStart: { [Op.between]: [windowStart, windowEnd] } },
    include: [{ model: User, as: 'patient' }, { model: DoctorProfile, as: 'doctor', include: [User] }],
  });

  for (const appt of upcoming) {
    // Avoid duplicate reminders: skip if we already queued/sent one for this appointment
    const already = await Notification.findOne({
      where: { relatedAppointmentId: appt.id, type: 'reminder' },
    });
    if (already) continue;

    const { subject, body } = reminderEmail({
      recipientName: appt.patient.name,
      doctorName: appt.doctor.User.name,
      slotStart: appt.slotStart,
    });
    await queueNotification({
      userId: appt.patient.id,
      recipientEmail: appt.patient.email,
      type: 'reminder',
      subject,
      body,
      relatedAppointmentId: appt.id,
    });
  }
}

function start() {
  const schedule = process.env.REMINDER_CRON || '*/15 * * * *';
  cron.schedule(schedule, async () => {
    try {
      await releaseExpiredHolds();
      await sendUpcomingReminders();
    } catch (err) {
      console.error('[reminderJob] failed:', err.message);
    }
  });
  console.log(`[reminderJob] scheduled with cron "${schedule}"`);
}

module.exports = { start, sendUpcomingReminders };

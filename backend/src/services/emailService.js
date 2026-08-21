const nodemailer = require('nodemailer');
const { Notification } = require('../models');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Queue a notification (outbox pattern). This should be called inside the
 * same DB transaction as the business event (e.g. booking creation) so that
 * "appointment booked" and "confirmation email queued" are atomic - if the
 * transaction rolls back, no orphan notification is left behind.
 */
async function queueNotification({ userId, recipientEmail, type, subject, body, relatedAppointmentId, transaction }) {
  return Notification.create(
    { userId, recipientEmail, type, subject, body, relatedAppointmentId },
    transaction ? { transaction } : undefined
  );
}

/**
 * Attempt to actually deliver one notification row and update its status.
 * Called by the background worker (see jobs/notificationRetryJob.js) - never
 * called directly from a request handler, so a slow/broken SMTP server can
 * never block the API.
 */
async function sendNotification(notification) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: notification.recipientEmail,
      subject: notification.subject,
      html: notification.body,
    });
    notification.status = 'sent';
    notification.sentAt = new Date();
    notification.lastError = null;
  } catch (err) {
    notification.attempts += 1;
    notification.lastError = err.message;
    notification.status = notification.attempts >= notification.maxAttempts ? 'dead_letter' : 'failed';
  }
  await notification.save();
  return notification;
}

// --- Templates -------------------------------------------------------------

function bookingConfirmationEmail({ recipientName, doctorName, slotStart }) {
  return {
    subject: 'Appointment Confirmed',
    body: `<p>Hi ${recipientName},</p><p>Your appointment with Dr. ${doctorName} on <b>${new Date(
      slotStart
    ).toLocaleString()}</b> is confirmed.</p><p>You'll receive a reminder before the visit.</p>`,
  };
}

function reminderEmail({ recipientName, doctorName, slotStart }) {
  return {
    subject: 'Appointment Reminder',
    body: `<p>Hi ${recipientName},</p><p>Reminder: your appointment with Dr. ${doctorName} is coming up on <b>${new Date(
      slotStart
    ).toLocaleString()}</b>.</p>`,
  };
}

function cancellationEmail({ recipientName, doctorName, slotStart, reason }) {
  return {
    subject: 'Appointment Cancelled',
    body: `<p>Hi ${recipientName},</p><p>Your appointment with Dr. ${doctorName} on <b>${new Date(
      slotStart
    ).toLocaleString()}</b> has been cancelled.${reason ? ` Reason: ${reason}` : ''}</p><p>Please rebook at your convenience.</p>`,
  };
}

function leaveConflictEmail({ recipientName, doctorName, slotStart }) {
  return {
    subject: 'Your Appointment Needs Rescheduling',
    body: `<p>Hi ${recipientName},</p><p>Dr. ${doctorName} is unavailable on <b>${new Date(
      slotStart
    ).toLocaleString()}</b> and your appointment has been cancelled. We're sorry for the inconvenience - please book a new slot.</p>`,
  };
}

function medicationReminderEmail({ recipientName, medication, dosage }) {
  return {
    subject: `Medication Reminder: ${medication}`,
    body: `<p>Hi ${recipientName},</p><p>This is a reminder to take your medication: <b>${medication}</b>${
      dosage ? ` (${dosage})` : ''
    }.</p>`,
  };
}

module.exports = {
  queueNotification,
  sendNotification,
  bookingConfirmationEmail,
  reminderEmail,
  cancellationEmail,
  leaveConflictEmail,
  medicationReminderEmail,
};

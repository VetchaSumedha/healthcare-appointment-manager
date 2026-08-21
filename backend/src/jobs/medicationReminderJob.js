const cron = require('node-cron');
const { Op } = require('sequelize');
const { MedicationReminder, User } = require('../models');
const { queueNotification, medicationReminderEmail } = require('../services/emailService');

async function sendDueMedicationReminders() {
  const due = await MedicationReminder.findAll({
    where: { active: true, nextReminderAt: { [Op.lte]: new Date() } },
    include: [User],
  });

  for (const reminder of due) {
    const patient = reminder.User;
    const { subject, body } = medicationReminderEmail({
      recipientName: patient.name,
      medication: reminder.medication,
      dosage: reminder.dosage,
    });
    await queueNotification({
      userId: patient.id,
      recipientEmail: patient.email,
      type: 'medication_reminder',
      subject,
      body,
    });

    // Schedule the next reminder, or deactivate once the course is finished
    const courseEnd = new Date(reminder.startDate);
    courseEnd.setDate(courseEnd.getDate() + reminder.durationDays);

    const intervalHours = Math.max(1, Math.floor(24 / reminder.timesPerDay));
    const next = new Date(reminder.nextReminderAt.getTime() + intervalHours * 60 * 60 * 1000);

    if (next > courseEnd) {
      reminder.active = false;
    } else {
      reminder.nextReminderAt = next;
    }
    await reminder.save();
  }
}

function start() {
  const schedule = process.env.MEDICATION_REMINDER_CRON || '0 * * * *';
  cron.schedule(schedule, async () => {
    try {
      await sendDueMedicationReminders();
    } catch (err) {
      console.error('[medicationReminderJob] failed:', err.message);
    }
  });
  console.log(`[medicationReminderJob] scheduled with cron "${schedule}"`);
}

module.exports = { start, sendDueMedicationReminders };

const cron = require('node-cron');
const { Op } = require('sequelize');
const { Notification } = require('../models');
const { sendNotification } = require('../services/emailService');

// Sends every 'pending' notification, and retries every 'failed' one that
// hasn't yet hit maxAttempts (exponential-ish backoff via the cron interval
// itself - a failed notification simply waits for the next tick).
async function processOutbox() {
  const due = await Notification.findAll({
    where: {
      status: { [Op.in]: ['pending', 'failed'] },
      scheduledFor: { [Op.lte]: new Date() },
    },
    limit: 50,
  });

  for (const notification of due) {
    if (notification.attempts >= notification.maxAttempts) {
      notification.status = 'dead_letter';
      await notification.save();
      continue;
    }
    await sendNotification(notification);
  }

  return { processed: due.length };
}

function start() {
  const schedule = process.env.EMAIL_RETRY_CRON || '*/10 * * * *';
  cron.schedule(schedule, async () => {
    try {
      const { processed } = await processOutbox();
      if (processed) console.log(`[emailRetryJob] processed ${processed} notification(s)`);
    } catch (err) {
      console.error('[emailRetryJob] failed:', err.message);
    }
  });
  console.log(`[emailRetryJob] scheduled with cron "${schedule}"`);
}

module.exports = { start, processOutbox };

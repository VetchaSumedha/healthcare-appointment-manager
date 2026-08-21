const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Outbox pattern: every notification we intend to send is written to this
// table FIRST (in the same transaction as the business event), then a
// background worker actually sends it and updates status. This means a
// crash or SMTP outage never silently drops a notification - it just stays
// 'pending'/'failed' and gets retried.
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  recipientEmail: { type: DataTypes.STRING, allowNull: false },
  type: {
    type: DataTypes.ENUM(
      'booking_confirmation',
      'reminder',
      'cancellation',
      'leave_conflict',
      'medication_reminder',
      'reschedule'
    ),
    allowNull: false,
  },
  subject: { type: DataTypes.STRING, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  relatedAppointmentId: { type: DataTypes.UUID, allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'failed', 'dead_letter'),
    defaultValue: 'pending',
  },
  attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  maxAttempts: { type: DataTypes.INTEGER, defaultValue: 5 },
  lastError: { type: DataTypes.STRING, allowNull: true },
  scheduledFor: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  sentAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'notifications',
  timestamps: true,
});

module.exports = Notification;

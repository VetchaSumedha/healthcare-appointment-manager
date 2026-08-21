const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const MedicationReminder = sequelize.define('MedicationReminder', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  visitNoteId: { type: DataTypes.UUID, allowNull: false },
  patientId: { type: DataTypes.UUID, allowNull: false },
  medication: { type: DataTypes.STRING, allowNull: false },
  dosage: { type: DataTypes.STRING, allowNull: true },
  timesPerDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  startDate: { type: DataTypes.DATEONLY, allowNull: false },
  durationDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  nextReminderAt: { type: DataTypes.DATE, allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'medication_reminders',
  timestamps: true,
});

module.exports = MedicationReminder;

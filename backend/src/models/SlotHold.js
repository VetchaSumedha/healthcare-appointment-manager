const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// A SlotHold is a short-lived reservation created the moment a patient clicks
// a slot, before they finish the symptom form + confirmation step.
// A unique index on (doctorId, slotStart) means only one hold/appointment can
// exist for a given doctor+time at once - this is the core double-booking guard.
const SlotHold = sequelize.define('SlotHold', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  doctorId: { type: DataTypes.UUID, allowNull: false },
  patientId: { type: DataTypes.UUID, allowNull: false },
  slotStart: { type: DataTypes.DATE, allowNull: false },
  slotEnd: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('active', 'confirmed', 'expired', 'released'), defaultValue: 'active' },
}, {
  tableName: 'slot_holds',
  timestamps: true,
  indexes: [
    // Only one ACTIVE/CONFIRMED hold per doctor+slot is enforced at the
    // application layer via a transaction (see appointment.controller.js),
    // since partial unique indexes differ across SQLite/Postgres.
    { fields: ['doctorId', 'slotStart'] },
  ],
});

module.exports = SlotHold;

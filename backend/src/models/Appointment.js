const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  doctorId: { type: DataTypes.UUID, allowNull: false }, // DoctorProfile.id
  slotStart: { type: DataTypes.DATE, allowNull: false },
  slotEnd: { type: DataTypes.DATE, allowNull: false },
  status: {
    type: DataTypes.ENUM(
      'confirmed',
      'cancelled_by_patient',
      'cancelled_by_doctor',
      'cancelled_leave_conflict',
      'completed',
      'no_show'
    ),
    defaultValue: 'confirmed',
  },
}, {
  tableName: 'appointments',
  timestamps: true,
  indexes: [
    // The actual hard guarantee against double-booking: the DB itself
    // rejects two CONFIRMED rows for the same doctor+slotStart. Partial index
    // means a cancelled slot frees up for rebooking. Supported on both
    // Postgres and SQLite (>= 3.8) via a WHERE clause on the index.
    {
      unique: true,
      fields: ['doctorId', 'slotStart'],
      name: 'unique_doctor_slot_confirmed',
      where: { status: 'confirmed' },
    },
  ],
});

module.exports = Appointment;

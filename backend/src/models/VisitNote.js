const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const VisitNote = sequelize.define('VisitNote', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId: { type: DataTypes.UUID, allowNull: false, unique: true },
  doctorNotes: { type: DataTypes.TEXT, allowNull: false },
  prescriptionText: { type: DataTypes.TEXT, allowNull: true },
  // Structured prescription for the reminder engine:
  // [{ medication, dosage, timesPerDay, durationDays }]
  prescriptionStructured: { type: DataTypes.JSON, allowNull: true },
  aiPatientSummary: { type: DataTypes.TEXT, allowNull: true },
  aiStatus: {
    type: DataTypes.ENUM('pending', 'success', 'failed'),
    defaultValue: 'pending',
  },
  aiError: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'visit_notes',
  timestamps: true,
});

module.exports = VisitNote;

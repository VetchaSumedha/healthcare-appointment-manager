const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SymptomForm = sequelize.define('SymptomForm', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId: { type: DataTypes.UUID, allowNull: false, unique: true },
  symptomsText: { type: DataTypes.TEXT, allowNull: false },
  // AI output stored as JSON: { urgency: 'Low'|'Medium'|'High', chiefComplaint, suggestedQuestions: [..] }
  aiSummary: { type: DataTypes.JSON, allowNull: true },
  aiStatus: {
    type: DataTypes.ENUM('pending', 'success', 'failed'),
    defaultValue: 'pending',
  },
  aiError: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'symptom_forms',
  timestamps: true,
});

module.exports = SymptomForm;

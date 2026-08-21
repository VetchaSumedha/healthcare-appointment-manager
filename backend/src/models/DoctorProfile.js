const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// workingHours example JSON:
// { "mon": {"start":"09:00","end":"17:00"}, "tue": {...}, ... "sun": null }
const DoctorProfile = sequelize.define('DoctorProfile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, unique: true },
  specialisation: { type: DataTypes.STRING, allowNull: false },
  slotDurationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
  workingHours: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  bio: { type: DataTypes.TEXT },
}, {
  tableName: 'doctor_profiles',
  timestamps: true,
});

module.exports = DoctorProfile;

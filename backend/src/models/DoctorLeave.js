const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const DoctorLeave = sequelize.define('DoctorLeave', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  doctorId: { type: DataTypes.UUID, allowNull: false }, // references DoctorProfile.id
  date: { type: DataTypes.DATEONLY, allowNull: false },
  reason: { type: DataTypes.STRING },
}, {
  tableName: 'doctor_leaves',
  timestamps: true,
  indexes: [{ unique: true, fields: ['doctorId', 'date'] }],
});

module.exports = DoctorLeave;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const CalendarEvent = sequelize.define('CalendarEvent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: false }, // whose calendar this event lives in
  googleEventId: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM('created', 'updated', 'deleted', 'failed'),
    defaultValue: 'created',
  },
  lastError: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'calendar_events',
  timestamps: true,
  indexes: [{ fields: ['appointmentId', 'userId'] }],
});

module.exports = CalendarEvent;

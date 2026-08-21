const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const GoogleToken = sequelize.define('GoogleToken', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, unique: true },
  accessToken: { type: DataTypes.TEXT, allowNull: false },
  refreshToken: { type: DataTypes.TEXT, allowNull: true },
  expiryDate: { type: DataTypes.BIGINT, allowNull: true },
}, {
  tableName: 'google_tokens',
  timestamps: true,
});

module.exports = GoogleToken;

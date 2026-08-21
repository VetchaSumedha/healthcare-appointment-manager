const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  // Production: Postgres (Render/Railway typically inject DATABASE_URL)
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production'
        ? { require: true, rejectUnauthorized: false }
        : false,
    },
    logging: false,
  });
} else {
  // Local/dev/demo: SQLite file, zero external setup required
  const storage = process.env.DATABASE_STORAGE || './data/database.sqlite';
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.resolve(storage),
    logging: false,
  });
}

module.exports = sequelize;

require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');

const { sequelize } = require('./models');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const doctorRoutes = require('./routes/doctor.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const calendarRoutes = require('./routes/calendar.routes');

const reminderJob = require('./jobs/reminderJob');
const medicationReminderJob = require('./jobs/medicationReminderJob');
const emailRetryJob = require('./jobs/emailRetryJob');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/calendar', calendarRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  // sync() is fine for the SQLite/demo path; for Postgres in production,
  // switch to migrations (see README) instead of alter-sync.
  await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
  console.log('Database synced');

  reminderJob.start();
  medicationReminderJob.start();
  emailRetryJob.start();

  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;

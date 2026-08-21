const sequelize = require('../config/db');
const User = require('./User');
const DoctorProfile = require('./DoctorProfile');
const DoctorLeave = require('./DoctorLeave');
const SlotHold = require('./SlotHold');
const Appointment = require('./Appointment');
const SymptomForm = require('./SymptomForm');
const VisitNote = require('./VisitNote');
const Notification = require('./Notification');
const CalendarEvent = require('./CalendarEvent');
const GoogleToken = require('./GoogleToken');
const MedicationReminder = require('./MedicationReminder');

// User <-> DoctorProfile (1:1)
User.hasOne(DoctorProfile, { foreignKey: 'userId', onDelete: 'CASCADE' });
DoctorProfile.belongsTo(User, { foreignKey: 'userId' });

// DoctorProfile <-> DoctorLeave (1:N)
DoctorProfile.hasMany(DoctorLeave, { foreignKey: 'doctorId', onDelete: 'CASCADE' });
DoctorLeave.belongsTo(DoctorProfile, { foreignKey: 'doctorId' });

// DoctorProfile <-> SlotHold (1:N), User(patient) <-> SlotHold
DoctorProfile.hasMany(SlotHold, { foreignKey: 'doctorId' });
SlotHold.belongsTo(DoctorProfile, { foreignKey: 'doctorId' });
User.hasMany(SlotHold, { foreignKey: 'patientId' });
SlotHold.belongsTo(User, { foreignKey: 'patientId' });

// Appointment associations
User.hasMany(Appointment, { foreignKey: 'patientId', as: 'patientAppointments' });
Appointment.belongsTo(User, { foreignKey: 'patientId', as: 'patient' });
DoctorProfile.hasMany(Appointment, { foreignKey: 'doctorId' });
Appointment.belongsTo(DoctorProfile, { foreignKey: 'doctorId', as: 'doctor' });

// Appointment <-> SymptomForm (1:1)
Appointment.hasOne(SymptomForm, { foreignKey: 'appointmentId', onDelete: 'CASCADE' });
SymptomForm.belongsTo(Appointment, { foreignKey: 'appointmentId' });

// Appointment <-> VisitNote (1:1)
Appointment.hasOne(VisitNote, { foreignKey: 'appointmentId', onDelete: 'CASCADE' });
VisitNote.belongsTo(Appointment, { foreignKey: 'appointmentId' });

// Notification belongs to a User, optionally references an Appointment
User.hasMany(Notification, { foreignKey: 'userId' });
Notification.belongsTo(User, { foreignKey: 'userId' });

// CalendarEvent
Appointment.hasMany(CalendarEvent, { foreignKey: 'appointmentId', onDelete: 'CASCADE' });
CalendarEvent.belongsTo(Appointment, { foreignKey: 'appointmentId' });
User.hasOne(GoogleToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
GoogleToken.belongsTo(User, { foreignKey: 'userId' });

// MedicationReminder
VisitNote.hasMany(MedicationReminder, { foreignKey: 'visitNoteId', onDelete: 'CASCADE' });
MedicationReminder.belongsTo(VisitNote, { foreignKey: 'visitNoteId' });
User.hasMany(MedicationReminder, { foreignKey: 'patientId' });
MedicationReminder.belongsTo(User, { foreignKey: 'patientId' });

module.exports = {
  sequelize,
  User,
  DoctorProfile,
  DoctorLeave,
  SlotHold,
  Appointment,
  SymptomForm,
  VisitNote,
  Notification,
  CalendarEvent,
  GoogleToken,
  MedicationReminder,
};

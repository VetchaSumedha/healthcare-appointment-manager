const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  sequelize,
  User,
  DoctorProfile,
  DoctorLeave,
  Appointment,
  CalendarEvent,
} = require('../models');
const { queueNotification, leaveConflictEmail } = require('../services/emailService');
const { deleteEventForUser } = require('../services/calendarService');

// Create a doctor: makes a User(role=doctor) + DoctorProfile together.
async function createDoctor(req, res) {
  const { name, email, password, specialisation, slotDurationMinutes, workingHours, bio } = req.body;
  if (!name || !email || !password || !specialisation || !workingHours) {
    return res.status(400).json({ error: 'name, email, password, specialisation and workingHours are required' });
  }

  const result = await sequelize.transaction(async (t) => {
    const existing = await User.findOne({ where: { email }, transaction: t });
    if (existing) throw Object.assign(new Error('A user with this email already exists'), { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role: 'doctor' }, { transaction: t });
    const profile = await DoctorProfile.create(
      { userId: user.id, specialisation, slotDurationMinutes: slotDurationMinutes || 30, workingHours, bio },
      { transaction: t }
    );
    return { user, profile };
  });

  res.status(201).json({
    doctor: {
      id: result.profile.id,
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      specialisation: result.profile.specialisation,
      slotDurationMinutes: result.profile.slotDurationMinutes,
      workingHours: result.profile.workingHours,
    },
  });
}

async function listDoctors(req, res) {
  const doctors = await DoctorProfile.findAll({ include: [{ model: User, attributes: ['id', 'name', 'email'] }] });
  res.json({ doctors });
}

async function updateDoctor(req, res) {
  const { id } = req.params;
  const doctor = await DoctorProfile.findByPk(id);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  const { specialisation, slotDurationMinutes, workingHours, bio } = req.body;
  await doctor.update({
    specialisation: specialisation ?? doctor.specialisation,
    slotDurationMinutes: slotDurationMinutes ?? doctor.slotDurationMinutes,
    workingHours: workingHours ?? doctor.workingHours,
    bio: bio ?? doctor.bio,
  });
  res.json({ doctor });
}

/**
 * Mark a doctor on leave for a date. This is the leave-conflict path:
 * 1. Find all CONFIRMED appointments for that doctor+date.
 * 2. In one transaction, cancel them (status=cancelled_leave_conflict) and
 *    queue a notification for each affected patient (outbox pattern - the
 *    cancellation and the "we owe you an email" record are atomic).
 * 3. After commit, best-effort delete each patient's calendar event.
 */
async function setDoctorLeave(req, res) {
  const { id } = req.params; // doctorId
  const { date, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

  const doctor = await DoctorProfile.findByPk(id, { include: [User] });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  const dayStart = new Date(date + 'T00:00:00');
  const dayEnd = new Date(date + 'T23:59:59.999');

  const affectedAppointments = await sequelize.transaction(async (t) => {
    await DoctorLeave.findOrCreate({
      where: { doctorId: id, date },
      defaults: { doctorId: id, date, reason },
      transaction: t,
    });

    const appointments = await Appointment.findAll({
      where: { doctorId: id, status: 'confirmed', slotStart: { [Op.gte]: dayStart, [Op.lte]: dayEnd } },
      include: [{ model: User, as: 'patient' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    for (const appt of appointments) {
      appt.status = 'cancelled_leave_conflict';
      await appt.save({ transaction: t });

      const { subject, body } = leaveConflictEmail({
        recipientName: appt.patient.name,
        doctorName: doctor.User.name,
        slotStart: appt.slotStart,
      });
      await queueNotification({
        userId: appt.patient.id,
        recipientEmail: appt.patient.email,
        type: 'leave_conflict',
        subject,
        body,
        relatedAppointmentId: appt.id,
        transaction: t,
      });
    }

    return appointments;
  });

  // Best-effort calendar cleanup - never lets a Google API hiccup block the
  // leave-marking response, since the notification (source of truth for the
  // patient) has already been durably queued above.
  for (const appt of affectedAppointments) {
    deleteEventForUser({ userId: appt.patientId, appointmentId: appt.id }).catch(() => {});
    deleteEventForUser({ userId: doctor.userId, appointmentId: appt.id }).catch(() => {});
  }

  res.json({
    message: `Doctor marked on leave for ${date}`,
    affectedAppointments: affectedAppointments.length,
  });
}

async function listDoctorLeave(req, res) {
  const { id } = req.params;
  const leaves = await DoctorLeave.findAll({ where: { doctorId: id }, order: [['date', 'ASC']] });
  res.json({ leaves });
}

module.exports = { createDoctor, listDoctors, updateDoctor, setDoctorLeave, listDoctorLeave };

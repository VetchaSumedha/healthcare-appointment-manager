const { sequelize, SlotHold, Appointment, DoctorProfile, User, SymptomForm } = require('../models');
const { createHold } = require('../services/slotService');
const { generatePreVisitSummary } = require('../services/llmService');
const {
  queueNotification,
  bookingConfirmationEmail,
  cancellationEmail,
} = require('../services/emailService');
const { createEventForUser, updateEventForUser, deleteEventForUser } = require('../services/calendarService');

// Step 1: patient clicks a slot -> place a short hold so nobody else can grab it
// while the patient fills the symptom form.
async function holdSlot(req, res) {
  const { doctorId, slotStart, slotEnd } = req.body;
  if (!doctorId || !slotStart || !slotEnd) {
    return res.status(400).json({ error: 'doctorId, slotStart and slotEnd are required' });
  }
  const hold = await createHold({
    doctorId,
    patientId: req.user.id,
    slotStart: new Date(slotStart),
    slotEnd: new Date(slotEnd),
  });
  res.status(201).json({ holdId: hold.id, expiresAt: hold.expiresAt });
}

// Step 2: patient submits symptom form -> confirm the appointment.
// This is the one place a double-booking could theoretically slip through,
// so it's guarded three ways: (a) the hold must still be active & unexpired,
// (b) the whole thing runs in a transaction with a row lock on the hold,
// (c) the Appointment table has a DB-level unique constraint on
// (doctorId, slotStart) for confirmed rows as the final backstop.
async function confirmAppointment(req, res) {
  const { holdId, symptomsText } = req.body;
  if (!holdId || !symptomsText) {
    return res.status(400).json({ error: 'holdId and symptomsText are required' });
  }

  const appointment = await sequelize.transaction(async (t) => {
    const hold = await SlotHold.findByPk(holdId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!hold || hold.status !== 'active' || hold.expiresAt < new Date()) {
      throw Object.assign(new Error('Your slot hold has expired. Please select a slot again.'), { status: 410 });
    }
    if (hold.patientId !== req.user.id) {
      throw Object.assign(new Error('This hold does not belong to you'), { status: 403 });
    }

    const appt = await Appointment.create(
      {
        patientId: hold.patientId,
        doctorId: hold.doctorId,
        slotStart: hold.slotStart,
        slotEnd: hold.slotEnd,
        status: 'confirmed',
      },
      { transaction: t } // unique index (doctorId, slotStart) WHERE status='confirmed' is the hard guarantee
    );

    await SymptomForm.create({ appointmentId: appt.id, symptomsText }, { transaction: t });

    hold.status = 'confirmed';
    await hold.save({ transaction: t });

    return appt;
  });

  // Fire-and-forget-ish: LLM summary, email, calendar all happen after the
  // booking is durably committed, and none of their failures roll it back.
  generatePreVisitSummary(symptomsText)
    .then(async ({ summary, error }) => {
      const form = await SymptomForm.findOne({ where: { appointmentId: appointment.id } });
      if (summary) {
        form.aiSummary = summary;
        form.aiStatus = 'success';
      } else {
        form.aiStatus = 'failed';
        form.aiError = error;
      }
      await form.save();
    })
    .catch(() => {});

  const [doctorProfile, patient] = await Promise.all([
    DoctorProfile.findByPk(appointment.doctorId, { include: [User] }),
    User.findByPk(appointment.patientId),
  ]);

  const { subject, body } = bookingConfirmationEmail({
    recipientName: patient.name,
    doctorName: doctorProfile.User.name,
    slotStart: appointment.slotStart,
  });
  await queueNotification({
    userId: patient.id,
    recipientEmail: patient.email,
    type: 'booking_confirmation',
    subject,
    body,
    relatedAppointmentId: appointment.id,
  });
  // Also notify the doctor
  const doctorEmailBits = bookingConfirmationEmail({
    recipientName: doctorProfile.User.name,
    doctorName: doctorProfile.User.name,
    slotStart: appointment.slotStart,
  });
  await queueNotification({
    userId: doctorProfile.userId,
    recipientEmail: doctorProfile.User.email,
    type: 'booking_confirmation',
    subject: 'New Appointment Booked',
    body: `<p>New appointment with ${patient.name} on <b>${new Date(appointment.slotStart).toLocaleString()}</b>.</p>`,
    relatedAppointmentId: appointment.id,
  });

  // Calendar sync for both sides - best effort, doesn't block the response
  createEventForUser({
    userId: patient.id,
    appointmentId: appointment.id,
    summary: `Appointment with Dr. ${doctorProfile.User.name}`,
    description: 'Healthcare appointment booked via Clinic Portal',
    start: appointment.slotStart,
    end: appointment.slotEnd,
  }).catch(() => {});
  createEventForUser({
    userId: doctorProfile.userId,
    appointmentId: appointment.id,
    summary: `Appointment with ${patient.name}`,
    description: 'Healthcare appointment booked via Clinic Portal',
    start: appointment.slotStart,
    end: appointment.slotEnd,
  }).catch(() => {});

  res.status(201).json({ appointment });
}

async function cancelAppointment(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const appointment = await Appointment.findByPk(id, { include: [{ model: User, as: 'patient' }] });
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

  const isPatient = req.user.role === 'patient' && appointment.patientId === req.user.id;
  const doctorProfile = req.user.role === 'doctor' ? await DoctorProfile.findOne({ where: { userId: req.user.id } }) : null;
  const isDoctor = doctorProfile && appointment.doctorId === doctorProfile.id;
  const isAdmin = req.user.role === 'admin';
  if (!isPatient && !isDoctor && !isAdmin) {
    return res.status(403).json({ error: 'You cannot cancel this appointment' });
  }

  appointment.status = isDoctor ? 'cancelled_by_doctor' : 'cancelled_by_patient';
  await appointment.save();

  const doctor = await DoctorProfile.findByPk(appointment.doctorId, { include: [User] });
  const { subject, body } = cancellationEmail({
    recipientName: appointment.patient.name,
    doctorName: doctor.User.name,
    slotStart: appointment.slotStart,
    reason,
  });
  await queueNotification({
    userId: appointment.patient.id,
    recipientEmail: appointment.patient.email,
    type: 'cancellation',
    subject,
    body,
    relatedAppointmentId: appointment.id,
  });

  deleteEventForUser({ userId: appointment.patientId, appointmentId: appointment.id }).catch(() => {});
  deleteEventForUser({ userId: doctor.userId, appointmentId: appointment.id }).catch(() => {});

  res.json({ appointment });
}

// Reschedule = hold a new slot, then atomically flip the existing appointment
// row to the new time (still protected by the same unique index).
async function rescheduleAppointment(req, res) {
  const { id } = req.params;
  const { newHoldId } = req.body;
  const appointment = await Appointment.findByPk(id);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
  if (appointment.patientId !== req.user.id) return res.status(403).json({ error: 'Not your appointment' });

  const updated = await sequelize.transaction(async (t) => {
    const hold = await SlotHold.findByPk(newHoldId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!hold || hold.status !== 'active' || hold.expiresAt < new Date()) {
      throw Object.assign(new Error('New slot hold has expired'), { status: 410 });
    }
    appointment.slotStart = hold.slotStart;
    appointment.slotEnd = hold.slotEnd;
    await appointment.save({ transaction: t }); // unique index re-validates the new time
    hold.status = 'confirmed';
    await hold.save({ transaction: t });
    return appointment;
  });

  updateEventForUser({ userId: appointment.patientId, appointmentId: appointment.id, start: updated.slotStart, end: updated.slotEnd }).catch(() => {});
  res.json({ appointment: updated });
}

async function myAppointmentsPatient(req, res) {
  const appointments = await Appointment.findAll({
    where: { patientId: req.user.id },
    include: [{ model: DoctorProfile, as: 'doctor', include: [User] }, { model: SymptomForm }],
    order: [['slotStart', 'DESC']],
  });
  res.json({ appointments });
}

module.exports = {
  holdSlot,
  confirmAppointment,
  cancelAppointment,
  rescheduleAppointment,
  myAppointmentsPatient,
};

const { Appointment, VisitNote, MedicationReminder, DoctorProfile, User } = require('../models');
const { generatePostVisitSummary } = require('../services/llmService');

/**
 * Doctor submits notes + structured prescription after the visit.
 * prescriptionStructured example:
 * [{ medication: "Amoxicillin", dosage: "500mg", timesPerDay: 3, durationDays: 7 }]
 */
async function submitVisitNote(req, res) {
  const { appointmentId } = req.params;
  const { doctorNotes, prescriptionText, prescriptionStructured } = req.body;
  if (!doctorNotes) return res.status(400).json({ error: 'doctorNotes is required' });

  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

  const doctorProfile = await DoctorProfile.findOne({ where: { userId: req.user.id } });
  if (!doctorProfile || appointment.doctorId !== doctorProfile.id) {
    return res.status(403).json({ error: 'You are not the doctor for this appointment' });
  }

  const visitNote = await VisitNote.create({
    appointmentId,
    doctorNotes,
    prescriptionText,
    prescriptionStructured: prescriptionStructured || null,
  });

  appointment.status = 'completed';
  await appointment.save();

  // Set up medication reminders from the structured prescription, if given
  if (Array.isArray(prescriptionStructured)) {
    const startDate = new Date().toISOString().slice(0, 10);
    for (const med of prescriptionStructured) {
      const nextReminderAt = new Date();
      nextReminderAt.setHours(nextReminderAt.getHours() + Math.floor(24 / (med.timesPerDay || 1)));
      await MedicationReminder.create({
        visitNoteId: visitNote.id,
        patientId: appointment.patientId,
        medication: med.medication,
        dosage: med.dosage,
        timesPerDay: med.timesPerDay || 1,
        startDate,
        durationDays: med.durationDays || 5,
        nextReminderAt,
        active: true,
      });
    }
  }

  // AI patient-friendly summary, generated async - failure never blocks the
  // doctor's workflow, just leaves aiStatus='failed' for a manual fallback.
  generatePostVisitSummary(doctorNotes + (prescriptionText ? `\nPrescription: ${prescriptionText}` : ''))
    .then(async ({ summary, error }) => {
      if (summary) {
        visitNote.aiPatientSummary = summary;
        visitNote.aiStatus = 'success';
      } else {
        visitNote.aiStatus = 'failed';
        visitNote.aiError = error;
      }
      await visitNote.save();
    })
    .catch(() => {});

  res.status(201).json({ visitNote });
}

async function getVisitNote(req, res) {
  const { appointmentId } = req.params;
  const note = await VisitNote.findOne({ where: { appointmentId } });
  if (!note) return res.status(404).json({ error: 'No visit note yet for this appointment' });
  res.json({ visitNote: note });
}

module.exports = { submitVisitNote, getVisitNote };

const { Op } = require('sequelize');
const { DoctorProfile, User } = require('../models');
const { getAvailableSlots } = require('../services/slotService');

async function searchDoctors(req, res) {
  const { specialisation } = req.query;
  const where = {};
  if (specialisation) where.specialisation = { [Op.like]: `%${specialisation}%` };

  const doctors = await DoctorProfile.findAll({
    where,
    include: [{ model: User, attributes: ['id', 'name', 'email'] }],
  });
  res.json({ doctors });
}

async function getDoctor(req, res) {
  const { id } = req.params;
  const doctor = await DoctorProfile.findByPk(id, { include: [{ model: User, attributes: ['id', 'name', 'email'] }] });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  res.json({ doctor });
}

async function getSlots(req, res) {
  const { id } = req.params;
  const { date } = req.query; // YYYY-MM-DD
  if (!date) return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
  const result = await getAvailableSlots(id, date);
  res.json(result);
}

// Doctor's own appointments (used by the doctor portal dashboard)
async function myAppointments(req, res) {
  const { Appointment, SymptomForm, User: UserModel } = require('../models'); // lazy require avoids circular import at module load
  const profile = await DoctorProfile.findOne({ where: { userId: req.user.id } });
  if (!profile) return res.status(404).json({ error: 'Doctor profile not found' });

  const appointments = await Appointment.findAll({
    where: { doctorId: profile.id },
    include: [
      { model: UserModel, as: 'patient', attributes: ['id', 'name', 'email', 'phone'] },
      { model: SymptomForm },
    ],
    order: [['slotStart', 'ASC']],
  });
  res.json({ appointments });
}

module.exports = { searchDoctors, getDoctor, getSlots, myAppointments };

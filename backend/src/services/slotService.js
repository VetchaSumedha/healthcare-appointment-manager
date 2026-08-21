const { Op } = require('sequelize');
const { sequelize, DoctorProfile, DoctorLeave, SlotHold, Appointment } = require('../models');

const HOLD_TTL_SECONDS = parseInt(process.env.SLOT_HOLD_TTL_SECONDS || '300', 10);
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Compute the list of bookable slot start times for a doctor on a given
 * calendar date, based on working hours minus already-confirmed
 * appointments, active holds, and leave days.
 */
async function getAvailableSlots(doctorId, dateStr) {
  const doctor = await DoctorProfile.findByPk(doctorId);
  if (!doctor) throw Object.assign(new Error('Doctor not found'), { status: 404 });

  const onLeave = await DoctorLeave.findOne({ where: { doctorId, date: dateStr } });
  if (onLeave) return { slots: [], onLeave: true };

  const dayKey = DAY_KEYS[new Date(dateStr + 'T00:00:00').getDay()];
  const hours = doctor.workingHours?.[dayKey];
  if (!hours) return { slots: [], onLeave: false };

  const duration = doctor.slotDurationMinutes;
  const [startH, startM] = hours.start.split(':').map(Number);
  const [endH, endM] = hours.end.split(':').map(Number);

  const dayStart = new Date(dateStr + 'T00:00:00');
  dayStart.setHours(startH, startM, 0, 0);
  const dayEnd = new Date(dateStr + 'T00:00:00');
  dayEnd.setHours(endH, endM, 0, 0);

  const allSlots = [];
  for (let t = new Date(dayStart); t < dayEnd; t = new Date(t.getTime() + duration * 60000)) {
    allSlots.push(new Date(t));
  }

  // Slots already confirmed
  const dayEndExclusive = new Date(dayEnd.getTime());
  const booked = await Appointment.findAll({
    where: { doctorId, status: 'confirmed', slotStart: { [Op.gte]: dayStart, [Op.lt]: dayEndExclusive } },
    attributes: ['slotStart'],
  });
  const bookedSet = new Set(booked.map((b) => b.slotStart.getTime()));

  // Slots currently held by someone mid-booking (and not yet expired)
  const activeHolds = await SlotHold.findAll({
    where: {
      doctorId,
      status: 'active',
      expiresAt: { [Op.gt]: new Date() },
      slotStart: { [Op.gte]: dayStart, [Op.lt]: dayEndExclusive },
    },
    attributes: ['slotStart'],
  });
  const heldSet = new Set(activeHolds.map((h) => h.slotStart.getTime()));

  const now = Date.now();
  const slots = allSlots
    .filter((s) => s.getTime() > now)
    .filter((s) => !bookedSet.has(s.getTime()) && !heldSet.has(s.getTime()))
    .map((s) => ({ start: s, end: new Date(s.getTime() + duration * 60000) }));

  return { slots, onLeave: false };
}

/**
 * Place a short-lived hold on a slot. This is what runs the instant a
 * patient clicks a time slot in the UI, before they've filled the symptom
 * form. It prevents a second patient from being shown / grabbing the same
 * slot while the first patient is mid-flow.
 *
 * Concurrency safety: we run inside a SERIALIZABLE-ish transaction and
 * re-check for conflicts (confirmed appointment or another active hold)
 * before inserting. Two simultaneous requests for the same slot will race on
 * this transaction; the DB's row locking / unique constraints ensure only
 * one wins even if the pre-check both pass (belt-and-braces with the
 * Appointment table's unique index at confirm time).
 */
async function createHold({ doctorId, patientId, slotStart, slotEnd }) {
  return sequelize.transaction(async (t) => {
    const conflictAppointment = await Appointment.findOne({
      where: { doctorId, slotStart, status: 'confirmed' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (conflictAppointment) {
      throw Object.assign(new Error('This slot has just been booked. Please pick another.'), { status: 409 });
    }

    const conflictHold = await SlotHold.findOne({
      where: { doctorId, slotStart, status: 'active', expiresAt: { [Op.gt]: new Date() } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (conflictHold) {
      throw Object.assign(new Error('This slot is currently being booked by someone else. Please pick another or try again shortly.'), { status: 409 });
    }

    const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);
    const hold = await SlotHold.create(
      { doctorId, patientId, slotStart, slotEnd, expiresAt, status: 'active' },
      { transaction: t }
    );
    return hold;
  });
}

/** Background sweep: mark expired holds so their slots free up. Called by the reminder cron tick. */
async function releaseExpiredHolds() {
  await SlotHold.update(
    { status: 'expired' },
    { where: { status: 'active', expiresAt: { [Op.lt]: new Date() } } }
  );
}

module.exports = { getAvailableSlots, createHold, releaseExpiredHolds, HOLD_TTL_SECONDS };

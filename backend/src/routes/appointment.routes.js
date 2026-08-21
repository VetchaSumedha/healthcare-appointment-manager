const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  holdSlot,
  confirmAppointment,
  cancelAppointment,
  rescheduleAppointment,
  myAppointmentsPatient,
} = require('../controllers/appointment.controller');
const { submitVisitNote, getVisitNote } = require('../controllers/visit.controller');

router.use(authenticate);

router.post('/hold', authorize('patient'), holdSlot);
router.post('/confirm', authorize('patient'), confirmAppointment);
router.get('/mine', authorize('patient'), myAppointmentsPatient);
router.post('/:id/cancel', cancelAppointment); // patient, doctor, or admin - checked inside controller
router.post('/:id/reschedule', authorize('patient'), rescheduleAppointment);

router.post('/:appointmentId/visit-note', authorize('doctor'), submitVisitNote);
router.get('/:appointmentId/visit-note', getVisitNote);

module.exports = router;

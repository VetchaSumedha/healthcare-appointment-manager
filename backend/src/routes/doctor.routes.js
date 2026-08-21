const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { searchDoctors, getDoctor, getSlots, myAppointments } = require('../controllers/doctor.controller');

// Doctor-only portal route (registered before the generic /:id param route)
router.get('/me/appointments', authenticate, authorize('doctor'), myAppointments);

// Public / any-authenticated-role browsing
router.get('/', authenticate, searchDoctors);
router.get('/:id', authenticate, getDoctor);
router.get('/:id/slots', authenticate, getSlots);

module.exports = router;

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createDoctor,
  listDoctors,
  updateDoctor,
  setDoctorLeave,
  listDoctorLeave,
} = require('../controllers/admin.controller');

router.use(authenticate, authorize('admin'));

router.post('/doctors', createDoctor);
router.get('/doctors', listDoctors);
router.patch('/doctors/:id', updateDoctor);
router.post('/doctors/:id/leave', setDoctorLeave);
router.get('/doctors/:id/leave', listDoctorLeave);

module.exports = router;

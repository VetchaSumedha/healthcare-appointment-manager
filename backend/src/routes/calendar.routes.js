const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { connect, callback } = require('../controllers/calendar.controller');

router.get('/connect', authenticate, connect);
// Note: Google redirects the browser directly here, so no Authorization
// header is present - identity comes from the signed `state` param instead.
router.get('/oauth/callback', callback);

module.exports = router;

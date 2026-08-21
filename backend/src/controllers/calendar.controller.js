const jwt = require('jsonwebtoken');
const { getAuthUrl, handleOAuthCallback } = require('../services/calendarService');

// Returns the Google consent URL the frontend should redirect the user to.
// We encode the user id in `state` (signed) so the callback (which Google
// hits directly, without our normal auth header) knows who to attach the
// tokens to.
function connect(req, res) {
  const state = jwt.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const url = getAuthUrl(state);
  res.json({ url });
}

async function callback(req, res) {
  const { code, state } = req.query;
  try {
    const { userId } = jwt.verify(state, process.env.JWT_SECRET);
    await handleOAuthCallback(userId, code);
    res.redirect(`${process.env.CLIENT_URL}/calendar-connected`);
  } catch (err) {
    res.redirect(`${process.env.CLIENT_URL}/calendar-connect-failed`);
  }
}

module.exports = { connect, callback };

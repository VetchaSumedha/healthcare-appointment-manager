// Centralized error handler. Because we use express-async-errors, any thrown
// error (including rejected promises in async route handlers) lands here
// instead of crashing the process.
function errorHandler(err, req, res, next) {
  console.error('[error]', err);

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'That slot was just taken by another booking. Please choose a different time.',
    });
  }
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: err.errors.map((e) => e.message).join(', ') });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = errorHandler;

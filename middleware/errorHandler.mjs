import { NotFoundError } from '../utils/errors.mjs';

export const notFoundHandler = (req, res, next) => next(new NotFoundError('That page does not exist.'));

// Express 5 forwards errors thrown inside async handlers here automatically.
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // A malformed id in the URL (e.g. /records/abc) is just "not found", not a server error
  if (err.name === 'CastError') err = new NotFoundError('We could not find what you were looking for.');

  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(err);

  res.status(status).render('error', {
    status,
    message: status < 500 ? err.message : 'Something went wrong on our side. Please try again.',
  });
};

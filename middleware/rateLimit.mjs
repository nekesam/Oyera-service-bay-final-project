import rateLimit from 'express-rate-limit';

// 10 failed logins per 15 minutes per IP. Successful logins are not counted.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) =>
    res.status(429).render('login', {
      formData: { identifier: req.body?.identifier || '' },
      errorMessage: 'Too many failed attempts. Please wait 15 minutes and try again.',
    }),
});

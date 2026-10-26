import crypto from 'crypto';
import { DomainError } from '../utils/errors.mjs';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const POST_FORM = /<form\b[^>]*\bmethod\s*=\s*["']?post["']?[^>]*>/gi;

// Adds <input type="hidden" name="_csrf"> right after every <form method="post"> tag,
// so no template has to be edited by hand.
export const injectCsrfToken = (html, token) =>
  html.replace(POST_FORM, (formTag) => `${formTag}<input type="hidden" name="_csrf" value="${token}">`);

const tokensMatch = (supplied, expected) => {
  const a = Buffer.from(String(supplied || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Must run after express-session and express.urlencoded.
export const csrfProtection = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  const token = req.session.csrfToken;
  res.locals.csrfToken = token;

  if (!SAFE_METHODS.has(req.method)) {
    const supplied = req.body?._csrf || req.get('x-csrf-token');
    if (!tokensMatch(supplied, token)) {
      return next(new DomainError('Your session expired or the form was invalid. Please go back, refresh the page and try again.', 403));
    }
  }

  const render = res.render.bind(res);
  res.render = (view, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    render(view, options, (err, html) => {
      if (err) return callback ? callback(err) : next(err);
      const output = injectCsrfToken(html, token);
      return callback ? callback(null, output) : res.send(output);
    });
  };

  return next();
};

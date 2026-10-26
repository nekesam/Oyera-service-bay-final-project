import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';

import { config } from './config/index.mjs';
import { csrfProtection } from './middleware/csrf.mjs';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.mjs';
import { getNotifications } from './services/notificationService.mjs';

import registerStockRoutes from './routes/registerStockRoutes.mjs';
import authRoutes from './routes/authRoutes.mjs';
import customerRoutes from './routes/customerRoutes.mjs';
import indexRoutes from './routes/indexRoutes.mjs';
import dashboardRoutes from './routes/dashboardRoutes.mjs';
import vehicleRoutes from './routes/vehicleRoutes.mjs';
import serviceRoutes from './routes/serviceRoutes.mjs';
import technicianRoutes from './routes/technicianRoutes.mjs';
import reportsRoutes from './routes/reportsRoutes.js';
import searchRoutes from './routes/searchRoutes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Builds the Express app without starting it, so tests can run it on any port.
// `sessionStore` lets tests swap MongoDB sessions for an in-memory store.
export const createApp = ({ sessionStore } = {}) => {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.set('view engine', 'pug');
  app.set('views', path.join(__dirname, 'views'));

  // Security headers. The Content-Security-Policy is switched off for now because the
  // pages load Bootstrap, Font Awesome and Tom Select from CDNs and use inline scripts.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      name: 'oyera.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore || MongoStore.create({ mongoUrl: config.databaseUrl, collectionName: 'sessions' }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: 1000 * 60 * 60 * 2,
      },
    }),
  );

  app.use(csrfProtection);

  // Make the logged-in user available to every Pug template
  app.use((req, res, next) => {
    res.locals.user = req.session.userId
      ? { fullName: req.session.userName, role: req.session.userRole }
      : null;
    next();
  });

  // Bell + sidebar counts (low stock, ready for pickup, unpaid). A failure here never breaks a page.
  app.use(async (req, res, next) => {
    if (req.method === 'GET' && req.session.userId) {
      try {
        res.locals.notifications = await getNotifications(req.session.userRole);
      } catch (error) {
        console.error('Could not load notifications:', error.message);
      }
    }
    next();
  });

  // One-time flash message: shown on the next page, then removed
  app.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
  });

  app.use('/registerStock', registerStockRoutes);
  app.use('/', authRoutes);
  app.use('/customers', customerRoutes);
  app.use('/', dashboardRoutes);
  app.use('/', indexRoutes);
  app.use('/vehicles', vehicleRoutes);
  app.use('/', serviceRoutes);
  app.use('/', technicianRoutes);
  app.use('/', reportsRoutes);
  app.use('/', searchRoutes);

  // Must stay last
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

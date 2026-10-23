import express from 'express';
import { isAdminOrSeniorTechnician } from '../middleware/auth.mjs';
import { getReportsPage } from '../controllers/reportsController.js';
import { exportServices, exportStock, exportCustomers } from '../controllers/exportControllers.mjs';
import { isAdmin } from '../middleware/auth.mjs';
import { getAuditLog } from '../controllers/auditControllers.mjs';

const router = express.Router();

router.get('/reports', isAdminOrSeniorTechnician, getReportsPage);
router.get('/reports/export/services.csv', isAdminOrSeniorTechnician, exportServices);
router.get('/reports/export/stock.csv', isAdminOrSeniorTechnician, exportStock);
router.get('/reports/export/customers.csv', isAdminOrSeniorTechnician, exportCustomers);
router.get('/audit', isAdmin, getAuditLog);

export default router;

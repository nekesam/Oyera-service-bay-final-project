import express from 'express';
import { isAdminOrSeniorTechnician } from '../middleware/auth.mjs';
import { getReportsPage } from '../controllers/reportsController.js';

const router = express.Router();

router.get('/reports', isAdminOrSeniorTechnician, getReportsPage);

export default router;

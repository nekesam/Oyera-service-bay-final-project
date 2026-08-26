import express from 'express';
import { isAdmin, isAuthenticated, isAdminOrSeniorTechnician } from '../middleware/auth.mjs';
import {
	// getCaptureServicePage,
	getDashboard
	// getDashboardStats,
} from '../controllers/dashboardControllers.mjs';

const router = express.Router();

router.get('/dashboard', isAuthenticated, getDashboard);
// router.get('/dashboard/stats', getDashboardStats);
// router.get('/capture-service', getCaptureServicePage);

export default router;
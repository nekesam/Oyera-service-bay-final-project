import express from 'express';
import { isAuthenticated, isAdmin } from '../middleware/auth.mjs';
import { validateTechnician } from '../Validation/userValidation.mjs';
import {
	getTechnicianPage,
	getTechnicianRegisterPage,
	registerTechnician,
	deleteTechnician,
	getEditTechnicianForm,
	updateTechnician,
} from '../controllers/technicianControllers.mjs';

const router = express.Router();

// const blockTechnicianMutations = (req, res) => {
// 	return res.status(403).send('Technicians page is view-only. Edit and delete are not allowed.');
// };

router.get('/technicians', isAuthenticated, getTechnicianPage);
router.get('/technicians/register', isAuthenticated, getTechnicianRegisterPage);
router.post('/technicians/register', isAuthenticated, validateTechnician, registerTechnician);
router.get('/technicians/edit/:id', isAuthenticated, getEditTechnicianForm);
router.post('/technicians/edit/:id', isAuthenticated, isAdmin, validateTechnician, updateTechnician);
router.post('/technicians/delete/:id', isAuthenticated, isAdmin, deleteTechnician);
router.get('/technicians/assign', isAuthenticated, (req, res) => res.redirect('/addRecord'));
router.get('/technicians/schedules', isAuthenticated, (req, res) => res.redirect('/records'));
router.get('/reports/technicians', isAuthenticated, (req, res) => res.redirect('/dashboard'));

export default router;

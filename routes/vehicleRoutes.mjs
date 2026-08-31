import express from "express";
import { isAuthenticated, isAdminOrSeniorTechnician } from '../middleware/auth.mjs';
import { validateVehicle } from '../Validation/userValidation.mjs';
import {
  getVehiclePage,
  getRegisterVehiclePage,
  createVehicle,
  getEditVehiclePage,
  updateVehicle,
  deleteVehicle,
  getVehicleDetail,
} from '../controllers/vehicleControllers.mjs';

const router = express.Router();

router.get('/', isAuthenticated, getVehiclePage);
router.get('/records', isAuthenticated, getVehiclePage);
router.get('/register', isAdminOrSeniorTechnician, getRegisterVehiclePage);
router.post('/register', isAdminOrSeniorTechnician, validateVehicle, createVehicle);
router.get('/edit/:id', isAdminOrSeniorTechnician, getEditVehiclePage);
router.post('/edit/:id', isAdminOrSeniorTechnician, validateVehicle, updateVehicle);
router.post('/delete/:id', isAdminOrSeniorTechnician, deleteVehicle);

// Backward-compatible alias for old form action
router.post('/vehicles', isAdminOrSeniorTechnician, validateVehicle, createVehicle);

router.get('/:id', isAuthenticated, getVehicleDetail);

export default router;
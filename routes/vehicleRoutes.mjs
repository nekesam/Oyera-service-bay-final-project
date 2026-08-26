import express from "express";
import { isAuthenticated } from '../middleware/auth.mjs';
import { validateVehicle } from '../Validation/userValidation.mjs';
import {
  getVehiclePage,
  getRegisterVehiclePage,
  createVehicle,
  getEditVehiclePage,
  updateVehicle,
  deleteVehicle,
} from '../controllers/vehicleControllers.mjs';

const router = express.Router();

router.get('/', isAuthenticated, getVehiclePage);
router.get('/records', isAuthenticated, getVehiclePage);
router.get('/register', isAuthenticated, getRegisterVehiclePage);
router.post('/register', isAuthenticated, validateVehicle, createVehicle);
router.get('/edit/:id', isAuthenticated, getEditVehiclePage);
router.post('/edit/:id', isAuthenticated, validateVehicle, updateVehicle);
router.post('/delete/:id', isAuthenticated, deleteVehicle);

// Backward-compatible alias for old form action
router.post('/vehicles', isAuthenticated, validateVehicle, createVehicle);

export default router;
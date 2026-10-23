import express from "express";
import { isAuthenticated, isAdminOrSeniorTechnician } from '../middleware/auth.mjs';
import { validateCustomer } from '../Validation/userValidation.mjs';
import {
  getCustomerRegistrationPage,
  createCustomer,
  getCustomerRecordsPage,
  getEditCustomerPage,
  updateCustomer,
  deleteCustomer,
  getCustomerDetail,
} from '../controllers/customerControllers.mjs';

const router = express.Router();

//full route paths for customer registration and customer records
// /customers/register
// /customers/records

router.get('/register', isAdminOrSeniorTechnician, getCustomerRegistrationPage);
router.get('/records', isAdminOrSeniorTechnician, getCustomerRecordsPage);
router.get('/edit/:id', isAdminOrSeniorTechnician, getEditCustomerPage);

router.post('/register', isAdminOrSeniorTechnician, validateCustomer, createCustomer);
router.post('/edit/:id', isAdminOrSeniorTechnician, validateCustomer, updateCustomer);
router.post('/delete/:id', isAdminOrSeniorTechnician, deleteCustomer);

router.get('/:id', isAuthenticated, getCustomerDetail);
 

export default router;
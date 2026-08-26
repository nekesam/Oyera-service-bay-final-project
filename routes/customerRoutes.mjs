import express from "express";
import { isAuthenticated } from '../middleware/auth.mjs';
import { validateCustomer } from '../Validation/userValidation.mjs';
import {
  getCustomerRegistrationPage,
  createCustomer,
  getCustomerRecordsPage,
  getEditCustomerPage,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customerControllers.mjs';

const router = express.Router();

//full route paths for customer registration and customer records
// /customers/register
// /customers/records

router.get('/register', isAuthenticated, getCustomerRegistrationPage);
router.get('/records', isAuthenticated, getCustomerRecordsPage);
router.get('/edit/:id', isAuthenticated, getEditCustomerPage);

router.post('/register', isAuthenticated, validateCustomer, createCustomer);
router.post('/edit/:id', isAuthenticated, validateCustomer, updateCustomer);
router.post('/delete/:id', isAuthenticated, deleteCustomer);
 

export default router;
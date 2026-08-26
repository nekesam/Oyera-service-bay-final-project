import express from "express";
import { getServiceForm, createServiceRecord, getAllRecords, getEditRecordForm, updateServiceRecord, deleteServiceRecord } from "../controllers/serviceControllers.mjs";
import { isAuthenticated, isAdminOrSeniorTechnician } from '../middleware/auth.mjs';
import { validateServiceRecord } from '../Validation/userValidation.mjs';

const router = express.Router();

router.get('/addRecord', isAdminOrSeniorTechnician, getServiceForm);
router.post('/addRecord', isAdminOrSeniorTechnician, validateServiceRecord, createServiceRecord);
router.get('/records', isAuthenticated, getAllRecords);
router.get('/records/edit/:id', isAdminOrSeniorTechnician, getEditRecordForm);
router.post('/records/edit/:id', isAdminOrSeniorTechnician, validateServiceRecord, updateServiceRecord);
router.post('/records/delete/:id', isAdminOrSeniorTechnician, deleteServiceRecord);

export default router

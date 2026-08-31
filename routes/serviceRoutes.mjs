import express from "express";
import { getServiceForm, createServiceRecord, getAllRecords, getEditRecordForm, updateServiceRecord, deleteServiceRecord, getServiceRecordDetail } from "../controllers/serviceControllers.mjs";
import { isAuthenticated } from '../middleware/auth.mjs';
import { validateServiceRecord } from '../Validation/userValidation.mjs';

const router = express.Router();

router.get('/addRecord', isAuthenticated, getServiceForm);
router.post('/addRecord', isAuthenticated, validateServiceRecord, createServiceRecord);
router.get('/records', isAuthenticated, getAllRecords);
router.get('/records/edit/:id', isAuthenticated, getEditRecordForm);
router.post('/records/edit/:id', isAuthenticated, validateServiceRecord, updateServiceRecord);
router.post('/records/delete/:id', isAuthenticated, deleteServiceRecord);
router.get('/records/:id', isAuthenticated, getServiceRecordDetail);

export default router

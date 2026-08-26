import express from "express";
import { getStockPage, getStockRecordsPage, createStockItem, getStockForm, addStock, getAllStock, getEditStockForm, updateStock, deleteStock} from "../controllers/stockControllers.mjs";
import {isAuthenticated, isAdminOrSeniorTechnician} from '../middleware/auth.mjs';
import { validateStock } from '../Validation/userValidation.mjs';

const router = express.Router();

router.get('/inventory', isAdminOrSeniorTechnician, getStockPage);
router.get('/records', isAuthenticated, getStockRecordsPage);
 
//full route path
// /registerStock/inventory

router.post('/add-stock', isAdminOrSeniorTechnician, validateStock, createStockItem);

router.get('/addStock', isAdminOrSeniorTechnician, getStockForm);
router.post('/addStock', isAdminOrSeniorTechnician, validateStock, addStock);
router.get('/stockList', isAuthenticated, getAllStock)

router.get('/stock/edit/:id', isAdminOrSeniorTechnician, getEditStockForm);
router.post('/stock/edit/:id', isAdminOrSeniorTechnician, validateStock, updateStock);

router.post('/stock/delete/:id', isAdminOrSeniorTechnician, deleteStock);
  
export default router;
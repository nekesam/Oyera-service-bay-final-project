import express from "express";
import {getRegisterForm, getLoginForm, getUserRecords, registerUser, loginUser, logoutUser, getEditUserForm, editProfile, deleteUser, getUserDetail} from "../controllers/authControllers.mjs";
import { isAdmin } from '../middleware/auth.mjs';
import { loginLimiter } from '../middleware/rateLimit.mjs';
import { validateSignup, validateLogin } from '../Validation/userValidation.mjs';


const router = express.Router();


router.get('/signup', isAdmin, getRegisterForm ); // Render the signup form
router.post('/signup', isAdmin, validateSignup, registerUser); //validate form first then register the user
router.get('/login', getLoginForm);
router.post('/login', loginLimiter, validateLogin, loginUser);
router.get('/logout', logoutUser);
router.get('/registerUser/userRecords', isAdmin, getUserRecords); // Only Admins can access the user records page
router.get('/registerUser/user/edit/:id', isAdmin, getEditUserForm);// Render the editUser form for a specific user
router.post('/registerUser/user/edit/:id', isAdmin, editProfile); //edit changes for a specific user.
router.post('/registerUser/user/delete/:id', isAdmin, deleteUser);
router.get('/registerUser/user/:id', isAdmin, getUserDetail);

export default router;

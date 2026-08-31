import User from "../models/User.mjs";
import bcrypt from "bcryptjs";
import { setFlash } from "../utils/flash.mjs";

// Sends empty form fields and no error message so the form starts clean.
export const getRegisterForm = (req, res) =>{
    res.render('registration', {
        formData: {
            fullName: '',
            identifier: '',
            role: '',
        },
        errorMessage: null,
    })
};

// Shows the login page with empty form fields and no error message so the form starts clean.
export const getLoginForm = (req, res) =>{
    res.render('login', {
        formData: {
            identifier: '',
        },
        errorMessage: null,
    })
};

// Renders the dashboard page with user information if the user is logged in, otherwise redirects to the login page.
export const getUserRecords = async (req, res) => {
    try {
        if (!req.session?.userId) {
            return res.redirect('/login');
        }

        const users = await User.find().sort({ createdAt: -1 }).lean();

        const records = users.map((user) => ({
            ...user,
            phoneNumber: user.phone || '',
        }));

        res.render('userRecords', { records });
    } catch (error) {
        console.error('Error loading user records', error);
        res.status(500).send('Error loading user records');
    }
};

// Handles user registration by validating input, creating a new user, and saving it to the database. If there are validation errors or any issues during registration, it renders the registration page with appropriate error messages.
export const registerUser = async (req, res) =>{
    try {
        const {fullName, identifier, role, password} = req.body;
        if (req.signupValidationErrors?.length) {
            return res.status(400).render('registration', {
                formData: {
                    fullName,
                    identifier,
                    role,
                },
                errorMessage: req.signupValidationErrors.join(' '),
            });
        }
        const isEmail = identifier.includes('@');
        const userData = {
            fullName, 
            role,
            password
        };

        if(isEmail){
            userData.email = identifier;
        }else{
            userData.phone = identifier;
        }
        const newUser = new User(userData)
        await newUser.save();
        setFlash(req, 'Account created successfully. Please log in.')
        res.redirect('/login')
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(400).render('registration', {
            formData: {
                fullName: req.body?.fullName || '',
                identifier: req.body?.identifier || '',
                role: req.body?.role || '',
            },
            errorMessage: `Registration failed: ${error.message}`,
        })
    }
}

// Handles user login by validating input, checking credentials, and creating a session. If there are validation errors or invalid credentials, it renders the login page with appropriate error messages.
export const loginUser = async (req, res) => {
    try {
        const {identifier, password} = req.body;
        if (req.loginValidationErrors?.length) {
            return res.status(400).render('login', {
                formData: {
                    identifier,
                },
                errorMessage: req.loginValidationErrors.join(' '),
            });
        }
        const isEmail = identifier.includes('@');
        const query = isEmail ? {email: identifier} : {phone: identifier};
        const user = await User.findOne(query);
        if(user && await bcrypt.compare(password, user.password)){
            req.session.userId = user._id
            req.session.userRole = user.role
            req.session.userName = user.fullName
            res.redirect('/dashboard')
        }else{
            return res.status(401).render('login', {
                formData: {
                    identifier,
                },
                errorMessage: 'Invalid credentials.',
            });
        }
    } catch (error) {
       console.error('Error logging in', error); 
       return res.status(500).render('login', {
            formData: {
                identifier: req.body?.identifier || '',
            },
            errorMessage: 'Server error. Please try again.',
       });
    }
};

export const logoutUser = (req, res) => {
  req.session.destroy(()=> res.redirect('/'));
}

// fetches the user data for the given user ID and renders the editUser form with that data. If the user is not found, it sends a 404 response. If there's an error during the process, it sends a 500 response.
export const getEditUserForm = async(req, res) =>{
    try {
        const user = await User.findById(req.params.id).lean()
        if(!user){
            return res.status(404).send('User not found')
        }
        res.render('editUser', {user})
    } catch (error) {
        console.error('Error loading editUserForm', error)
        res.status(500).send('Error loading Edit User Form')
    }
}

// Updates the profile of the logged-in user or the user specified by ID. If the update is successful, redirects to the dashboard. If the user is not found, sends a 404 response. If there's an error, sends a 500 response.
export const editProfile = async (req, res) => {
    try {
        const userId = req.params.id || req.session.userId;
        const {fullName, email, phone} = req.body;
        const updatedUser = await User.findByIdAndUpdate(userId, {fullName, email, phone}, {new: true});
        if(updatedUser){
            setFlash(req, 'Profile updated successfully.');
            res.redirect('/dashboard');
        }else{
            res.status(404).send('User not found');
        }
    } catch (error) {
        res.status(500).send('Server error');
        console.error('Error updating profile', error);
    }
};

export const deleteUser = async(req, res)=>{
	try {
		await User.findByIdAndDelete(req.params.id)
		setFlash(req, 'User deleted.')
		res.redirect('/registerUser/userRecords')
	} catch (error) {
		console.error('Error deleting user', error)
		res.status(500).send('Error deleting user')
	}
}

export const getUserDetail = async(req, res)=>{
	try {
		const profile = await User.findById(req.params.id).lean()
		if(!profile){
			return res.status(404).send('User not found')
		}
		const nameParts = String(profile.fullName || '').split(' ').filter(Boolean).slice(0, 2)
		const initials = nameParts.map((part) => part[0].toUpperCase()).join('') || '--'
		res.render('userDetail', { profile, initials })
	} catch (error) {
		console.error('Error loading user detail', error)
		res.status(500).send('Error loading user detail')
	}
}

const isLoggedIn = (req) => Boolean(req.session?.userId);

const isSeniorRole = (role) => role === 'Senior technician' || role === 'senior technician';

// Any loggedIn user can pass.
export const isAuthenticated = (req, res, next) => {
    if (isLoggedIn(req)) { 
        return next(); //continue to controller if user is logged in.
    }
    return res.redirect('/login');
};

// Only Senior Technicians can pass.
export const isSeniorTechnician = (req, res, next) => {
    if (!isLoggedIn(req)) {
        return res.redirect('/login');
    }

    if (isSeniorRole(req.session.userRole)) {
        return next();
    }

    return res.status(403).send('Access denied: Senior Technicians only');
};

// Only Admins can pass.
export const isAdmin = (req, res, next) => {
    if (!isLoggedIn(req)) {

        return res.redirect('/login');
    }

    if (req.session.userRole === 'Admin') {
        return next();
    }

    return res.status(403).send('Access denied: Admins only');
};

// Only Admins or Senior Technicians can pass.
export const isAdminOrSeniorTechnician = (req, res, next) => {
    if (!isLoggedIn(req)) {
        return res.redirect('/login');
    }

    if (req.session.userRole === 'Admin' || isSeniorRole(req.session.userRole)) {
        return next();
    }

    return res.status(403).send('Access denied: Admin and Senior Technicians only');
};
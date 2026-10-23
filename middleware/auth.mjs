import { setFlash } from '../utils/flash.mjs';

const isLoggedIn = (req) => Boolean(req.session?.userId);

const isSeniorRole = (role) =>
    role === 'Senior technician' || role === 'senior technician';

// Get the page the user came from
const getPreviousPage = (req) => {
    return req.get('Referrer') || '/dashboard';
};


// Any logged-in user can pass
export const isAuthenticated = (req, res, next) => {
    if (isLoggedIn(req)) {
        return next();
    }

    setFlash(req, 'Please log in to continue.', 'danger');

    return res.redirect('/login');
};


// Only Senior Technicians can pass
export const isSeniorTechnician = (req, res, next) => {
    if (!isLoggedIn(req)) {
        setFlash(req, 'Please log in to continue.', 'danger');
        return res.redirect('/login');
    }

    if (isSeniorRole(req.session.userRole)) {
        return next();
    }

    setFlash(
        req,
        'Access denied. This action is only available to Senior Technicians.',
        'danger'
    );

    return res.redirect(getPreviousPage(req));
};


// Only Admins can pass
export const isAdmin = (req, res, next) => {
    if (!isLoggedIn(req)) {
        setFlash(req, 'Please log in to continue.', 'danger');
        return res.redirect('/login');
    }

    if (req.session.userRole === 'Admin') {
        return next();
    }

    setFlash(
        req,
        'Access denied. This action is only available to Administrators.',
        'danger'
    );

    return res.redirect(getPreviousPage(req));
};


// Only Admins or Senior Technicians can pass
export const isAdminOrSeniorTechnician = (req, res, next) => {
    if (!isLoggedIn(req)) {
        setFlash(req, 'Please log in to continue.', 'danger');
        return res.redirect('/login');
    }

    if (
        req.session.userRole === 'Admin' ||
        isSeniorRole(req.session.userRole)
    ) {
        return next();
    }

    setFlash(
        req,
        'Access denied. Only Admins and Senior Technicians can perform this action.',
        'danger'
    );

    return res.redirect(getPreviousPage(req));
};
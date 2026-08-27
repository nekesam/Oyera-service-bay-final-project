const NAME_PATTERN = /^[A-Za-z\s'-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+256|0)7\d{8}$/;
const PLATE_PATTERN = /^[A-Za-z]{3}\s?\d{3}[A-Za-z]$/;
const STOCK_ID_PATTERN = /^[A-Za-z0-9-]{3,30}$/;
const ITEM_NAME_PATTERN = /^[A-Za-z0-9\s()\-.,&+/]{2,120}$/;

const ALLOWED_USER_ROLES = ['Admin', 'Senior technician', 'Technician'];
const ALLOWED_TECHNICIAN_ROLES = ['Technician', 'Senior technician'];
const ALLOWED_VEHICLE_TYPES = ['small', 'commercial', 'heavy'];
const ALLOWED_VEHICLE_STATUS = ['Active', 'Service Due'];
const ALLOWED_STOCK_UNITS = ['Litres', 'Bottles', 'Pieces', 'Boxes', 'Sets'];
const ALLOWED_STOCK_CATEGORIES = [
    'Engine Oil',
    'Gearbox Oil',
    'Brake Fluid',
    'Oil Filter',
    'Air Filter',
    'Brake Pads',
    'Grease',
    'Coolant',
    'Filters',
    'Other',
];

const toCleanString = (value) => String(value || '').trim();
const normalizePhoneInput = (value) => String(value || '').replace(/[\s-]/g, '');

const normalizeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
};

const isValidName = (value) => NAME_PATTERN.test(value);
const isValidEmail = (value) => EMAIL_PATTERN.test(value);
const isValidPhone = (value) => PHONE_PATTERN.test(normalizePhoneInput(value));
const isValidPlate = (value) => PLATE_PATTERN.test(value.toUpperCase());
const isValidItemName = (value) => ITEM_NAME_PATTERN.test(value) && /[A-Za-z]/.test(value);

const sendValidationError = (res, errors) => {
    return res.status(400).send(`Validation failed: ${errors.join(' ')}`);
};

export const validateSignup = (req, res, next) => {
    const fullName = toCleanString(req.body?.fullName);
    const identifier = toCleanString(req.body?.identifier);
    const role = toCleanString(req.body?.role);
    const password = toCleanString(req.body?.password);
    const errors = [];

    if (!fullName || !identifier || !role || !password) {
        errors.push('All signup fields are required.');
    }
    if (fullName && !isValidName(fullName)) {
        errors.push('Full name is invalid.');
    }
    if (identifier && !(isValidEmail(identifier) || isValidPhone(identifier))) {
        errors.push('Identifier must be a valid email or phone number.');
    }
    if (role && !ALLOWED_USER_ROLES.includes(role)) {
        errors.push('Selected role is invalid.');
    }
    if (password && password.length < 6) {
        errors.push('Password must be at least 6 characters long.');
    }

    req.body.fullName = fullName;
    req.body.identifier = identifier;
    req.body.role = role;
    req.body.password = password;
    if (errors.length) {
        req.signupValidationErrors = errors;
    }
    return next();
};

export const validateLogin = (req, res, next) => {
    const identifier = toCleanString(req.body?.identifier);
    const password = toCleanString(req.body?.password);
    const errors = [];

    if (!identifier || !password) {
        errors.push('Identifier and password are required.');
    }
    if (identifier && !(isValidEmail(identifier) || isValidPhone(identifier))) {
        errors.push('Identifier must be a valid email or phone number.');
    }

    req.body.identifier = identifier;
    req.body.password = password;
    if (errors.length) {
        req.loginValidationErrors = errors;
    }
    return next();
};

export const validateCustomer = (req, res, next) => {
    const customerId = toCleanString(req.body?.customerId);
    const firstName = toCleanString(req.body?.firstName);
    const lastName = toCleanString(req.body?.lastName);
    const phone = toCleanString(req.body?.phone);
    const email = toCleanString(req.body?.email);
    const address = toCleanString(req.body?.address);
    const errors = [];

    if (!firstName || !lastName || !phone) {
        errors.push('First name, last name and phone are required.');
    }
    if (firstName && !isValidName(firstName)) {
        errors.push('First name is invalid.');
    }
    if (lastName && !isValidName(lastName)) {
        errors.push('Last name is invalid.');
    }
    if (phone && !isValidPhone(phone)) {
        errors.push('Phone number format is invalid.');
    }
    if (email && !isValidEmail(email)) {
        errors.push('Email format is invalid.');
    }

    req.body.customerId = customerId;
    req.body.firstName = firstName;
    req.body.lastName = lastName;
    req.body.phone = phone;
    req.body.email = email;
    req.body.address = address;
    if (errors.length) {
        req.customerValidationErrors = errors;
    }
    return next();
};

export const validateVehicle = (req, res, next) => {
    const customerId = toCleanString(req.body?.customerId);
    const vehicleName = toCleanString(req.body?.vehicleName);
    const color = toCleanString(req.body?.color);
    const registrationNo = toCleanString(req.body?.registrationNo).toUpperCase();
    const ownerName = toCleanString(req.body?.ownerName);
    const vehicleType = toCleanString(req.body?.vehicleType);
    const status = toCleanString(req.body?.status);
    const lastService = toCleanString(req.body?.lastService);
    const errors = [];

    if (!vehicleName || !registrationNo || !ownerName) {
        errors.push('Vehicle name, registration number and owner name are required.');
    }
    if (vehicleName && !isValidName(vehicleName)) {
        errors.push('Vehicle name is invalid.');
    }
    if (ownerName && !isValidName(ownerName)) {
        errors.push('Owner name is invalid.');
    }
    if (registrationNo && !isValidPlate(registrationNo)) {
        errors.push('Registration number format is invalid.');
    }
    if (vehicleType && !ALLOWED_VEHICLE_TYPES.includes(vehicleType)) {
        errors.push('Vehicle type is invalid.');
    }
    if (status && !ALLOWED_VEHICLE_STATUS.includes(status)) {
        errors.push('Vehicle status is invalid.');
    }

    req.body.vehicleName = vehicleName;
    req.body.color = color;
    req.body.registrationNo = registrationNo;
    req.body.ownerName = ownerName;
    req.body.customerId = customerId;
    req.body.vehicleType = vehicleType;
    req.body.status = status;
    req.body.lastService = lastService;
    if (errors.length) {
        req.vehicleValidationErrors = errors;
    }
    return next();
};

export const validateTechnician = (req, res, next) => {
    const fullName = toCleanString(req.body?.fullName);
    const identifier = toCleanString(req.body?.identifier);
    const role = toCleanString(req.body?.role);
    const password = toCleanString(req.body?.password);
    const errors = [];

    if (!fullName || !identifier || !password) {
        errors.push('Full name, identifier and password are required.');
    }
    if (fullName && !isValidName(fullName)) {
        errors.push('Technician full name is invalid.');
    }
    const isEmailIdentifier = identifier.includes('@');
    if (identifier && !(isValidEmail(identifier) || isValidPhone(identifier))) {
        errors.push('Identifier must be a valid email or phone number (07XXXXXXXX or +2567XXXXXXXX).');
    }
    if (identifier && !isEmailIdentifier && !isValidPhone(identifier)) {
        errors.push('Technician phone number format is invalid. Use 07XXXXXXXX or +2567XXXXXXXX.');
    }
    if (role && !ALLOWED_TECHNICIAN_ROLES.includes(role)) {
        errors.push('Technician role is invalid.');
    }
    if (password && password.length < 6) {
        errors.push('Password must be at least 6 characters long.');
    }

    req.body.fullName = fullName;
    req.body.identifier = isEmailIdentifier ? identifier : normalizePhoneInput(identifier);
    req.body.role = role;
    req.body.password = password;
    if (errors.length) {
        req.technicianValidationErrors = errors;
    }
    return next();
};

export const validateTechnicianUpdate = (req, res, next) => {
    const fullName = toCleanString(req.body?.fullName);
    const email = toCleanString(req.body?.email);
    const phone = toCleanString(req.body?.phone);
    const role = toCleanString(req.body?.role);
    const errors = [];

    if (!fullName) {
        errors.push('Full name is required.');
    }
    if (fullName && !isValidName(fullName)) {
        errors.push('Technician full name is invalid.');
    }
    if (email && !isValidEmail(email)) {
        errors.push('Email format is invalid.');
    }
    if (phone && !isValidPhone(phone)) {
        errors.push('Phone number format is invalid.');
    }
    if (role && !ALLOWED_TECHNICIAN_ROLES.includes(role)) {
        errors.push('Technician role is invalid.');
    }
    if (!email && !phone) {
        errors.push('Provide at least one contact: email or phone.');
    }

    req.body.fullName = fullName;
    req.body.email = email;
    req.body.phone = phone ? normalizePhoneInput(phone) : '';
    req.body.role = role;
    if (errors.length) {
        req.technicianUpdateValidationErrors = errors;
    }
    return next();
};

export const validateServiceRecord = (req, res, next) => {
    const customer = toCleanString(req.body?.customer);
    const vehicle = toCleanString(req.body?.vehicle);
    const servicesDone = normalizeArray(req.body?.servicesDone).map((value) => toCleanString(value)).filter(Boolean);
    const technicians = normalizeArray(req.body?.technicians).map((value) => toCleanString(value)).filter(Boolean);
    const rawPartIds = normalizeArray(req.body?.partIds).map((value) => toCleanString(value));
    const rawPartQuantities = normalizeArray(req.body?.partQuantities);
    const partIds = [];
    const partQuantities = [];
    const errors = [];

    if (!customer || !vehicle) {
        errors.push('Customer and vehicle are required.');
    }
    if (!servicesDone.length) {
        errors.push('At least one service must be selected.');
    }
    if (!technicians.length) {
        errors.push('At least one technician must be assigned.');
    }
    for (let i = 0; i < rawPartIds.length; i++) {
        const selectedPartId = rawPartIds[i];
        const parsedQuantity = Number(rawPartQuantities[i]);

        if (!selectedPartId) {
            continue;
        }

        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
            errors.push('Each selected part must have a positive quantity.');
            break;
        }

        partIds.push(selectedPartId);
        partQuantities.push(parsedQuantity);
    }

    req.body.customer = customer;
    req.body.vehicle = vehicle;
    req.body.servicesDone = servicesDone;
    req.body.technicians = technicians;
    req.body.partIds = partIds;
    req.body.partQuantities = partQuantities;
    if (errors.length) {
        req.serviceValidationErrors = errors;
    }
    return next();
};

const parseNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
};

const STOCK_PRICE_RULES = [
    { keywords: ['engine oil'], min: 79000, max: 200000 },
    { keywords: ['brake fluid'], min: 13000, max: 20000 },
    { keywords: ['oil filter'], min: 15000, max: 20000 },
];

const normalizeRulePrice = (price, rule) => {
    if (!Number.isFinite(price) || !rule) return price;
    if (price >= rule.min && price <= rule.max) return price;

    // Accept common data-entry typo where one trailing zero was omitted.
    const scaledByTen = price * 10;
    if (scaledByTen >= rule.min && scaledByTen <= rule.max) {
        return scaledByTen;
    }

    return price;
};

const validateStockPayload = (body) => {
    const stockId = toCleanString(body?.stockId);
    const itemName = toCleanString(body?.itemName);
    const category = toCleanString(body?.category);
    const supplier = toCleanString(body?.supplier);
    const unit = toCleanString(body?.unit);
    const date = toCleanString(body?.date);
    const storageLocation = toCleanString(body?.storageLocation);
    const description = toCleanString(body?.description);
    const quantity = parseNumber(body?.quantity);
    const unitPriceInput = parseNumber(body?.unitPrice ?? body?.price);
    const errors = [];

    if (stockId && !STOCK_ID_PATTERN.test(stockId)) {
        errors.push('Stock ID can only contain letters, numbers and hyphens.');
    }
    if (typeof body?.itemName !== 'string') {
        errors.push('Item name must be a text value.');
    }
    if (!itemName) {
        errors.push('Item name is required.');
    } else if (!isValidItemName(itemName)) {
        errors.push('Item name must be 2-120 characters and contain letters.');
    }
    if (!category) {
        errors.push('Category is required.');
    } else if (!ALLOWED_STOCK_CATEGORIES.includes(category)) {
        errors.push('Category is invalid.');
    }
    if (quantity === null || Number.isNaN(quantity) || quantity < 0) {
        errors.push('Quantity must be a non-negative number.');
    }
    if (unitPriceInput === null || Number.isNaN(unitPriceInput) || unitPriceInput < 0) {
        errors.push('Unit price must be a non-negative number.');
    }
    const priceText = `${itemName} ${category}`.toLowerCase();
    const activeRule = STOCK_PRICE_RULES.find((rule) => rule.keywords.some((keyword) => priceText.includes(keyword)));
    const unitPrice = normalizeRulePrice(unitPriceInput, activeRule);

    if (Number.isFinite(unitPrice)) {
        if (priceText.includes('engine oil') && (unitPrice < 79000 || unitPrice > 200000)) {
            errors.push('Engine oil price must be between UGX 79,000 and UGX 200,000.');
        }
        if (priceText.includes('brake fluid') && (unitPrice < 13000 || unitPrice > 20000)) {
            errors.push('Brake fluid price must be between UGX 13,000 and UGX 20,000.');
        }
        if (priceText.includes('oil filter') && (unitPrice < 15000 || unitPrice > 20000)) {
            errors.push('Oil filter price must be between UGX 15,000 and UGX 20,000.');
        }
    }
    if (unit && !ALLOWED_STOCK_UNITS.includes(unit)) {
        errors.push('Unit is invalid.');
    }
    if (date && Number.isNaN(new Date(date).getTime())) {
        errors.push('Date received is invalid.');
    }

    return {
    errors,
    payload: {
        stockId,
        itemName,
        category,
        supplier,
        quantity,
        unit,
        unitPrice,
        date,
        storageLocation,
        description,
    },
};

};

export const validateStock = (req, res, next) => {
    const { errors, payload } = validateStockPayload(req.body);
    req.body = {
        ...req.body,
        ...payload,
    };
    if (errors.length) {
        req.stockValidationErrors = errors;
    }
    return next();
};

export const sanitizeStockPayload = (body) => {
    const { payload } = validateStockPayload(body || {});
    return payload;
};

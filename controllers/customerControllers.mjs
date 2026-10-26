import Customers from '../models/Customers.mjs';
import Vehicle from '../models/Vehicle.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import { setFlash } from '../utils/flash.mjs';
import { audit } from '../services/auditService.mjs';
import { clearNotificationCache } from '../services/notificationService.mjs';
import { normalizePhone } from '../utils/phone.mjs';
import { whyCustomerCannotBeDeleted } from '../services/deletionGuards.mjs';

const buildInitials = (name) => {
  const parts = String(name || '').split(' ').filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part[0].toUpperCase()).join('');
  return letters || '--';
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeCustomerPhone = normalizePhone;

const normalizeCustomerName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const findDuplicateCustomer = async ({ firstName, lastName, phone, excludeId }) => {
  const namePattern = (value) => new RegExp(
    `^${String(value).trim().split(/\s+/).map(escapeRegExp).join('\\s+')}$`,
    'i'
  );
  const query = {
    firstName: namePattern(firstName),
    lastName: namePattern(lastName),
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const possibleDuplicates = await Customers.find(query).select('firstName lastName phone').lean();
  return possibleDuplicates.find((customer) =>
    normalizeCustomerName(customer.firstName) === normalizeCustomerName(firstName)
    && normalizeCustomerName(customer.lastName) === normalizeCustomerName(lastName)
    && normalizeCustomerPhone(customer.phone) === normalizeCustomerPhone(phone)
  );
};

export const getCustomerRegistrationPage = (req, res) => {
  res.render('customers', {
    formData: {
      customerId: '',
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
    },
    errorMessage: null,
  });
};

export const createCustomer = async (req, res) => {
  try {
    if (req.customerValidationErrors?.length) {
      return res.status(400).render('customers', {
        formData: {
          customerId: req.body?.customerId || '',
          firstName: req.body?.firstName || '',
          lastName: req.body?.lastName || '',
          phone: req.body?.phone || '',
          email: req.body?.email || '',
          address: req.body?.address || '',
        },
        errorMessage: req.customerValidationErrors.join(' '),
      });
    }

    const duplicateCustomer = await findDuplicateCustomer(req.body);
    if (duplicateCustomer) {
      return res.status(400).render('customers', {
        formData: {
          customerId: req.body?.customerId || '',
          firstName: req.body?.firstName || '',
          lastName: req.body?.lastName || '',
          phone: req.body?.phone || '',
          email: req.body?.email || '',
          address: req.body?.address || '',
        },
        errorMessage: 'A customer with the same name and phone number is already registered.',
      });
    }

    const newCustomer = new Customers({ ...req.body, phone: normalizePhone(req.body.phone) });
    await newCustomer.save();
    await audit(req, { action: 'created', entity: 'Customers', entityId: newCustomer._id, summary: `Registered customer ${newCustomer.firstName} ${newCustomer.lastName}.` });
    setFlash(req, `Customer "${newCustomer.firstName} ${newCustomer.lastName}" registered successfully.`);
    return res.redirect('/customers/register');
  } catch (error) {
    console.error('Failed to add customer:', error);
    return res.status(400).render('customers', {
      formData: {
        customerId: req.body?.customerId || '',
        firstName: req.body?.firstName || '',
        lastName: req.body?.lastName || '',
        phone: req.body?.phone || '',
        email: req.body?.email || '',
        address: req.body?.address || '',
      },
      errorMessage: 'Failed to add customer. Check your input and try again.',
    });
  }
};

export const getCustomerRecordsPage = async (req, res) => {
  try {
    const records = await Customers.find({}).sort({ _id: -1 }).lean();
    return res.render('customerRecords', { records });
  } catch (error) {
    console.error('Failed to load customer records:', error);
    return res.status(500).send('Failed to load customer records.');
  }
};

export const getEditCustomerPage = async (req, res) => {
  try {
    const customer = await Customers.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).send('Customer not found.');
    }
    return res.render('editCustomer', { customer, errorMessage: null });
  } catch (error) {
    console.error('Failed to load edit customer page:', error);
    return res.status(500).send('Failed to load edit customer page.');
  }
};

export const updateCustomer = async (req, res) => {
  try {
    if (req.customerValidationErrors?.length) {
      const existing = await Customers.findById(req.params.id).lean();
      return res.status(400).render('editCustomer', {
        customer: {
          ...(existing || {}),
          ...req.body,
          _id: req.params.id,
        },
        errorMessage: req.customerValidationErrors.join(' '),
      });
    }

    const duplicateCustomer = await findDuplicateCustomer({ ...req.body, excludeId: req.params.id });
    if (duplicateCustomer) {
      const existing = await Customers.findById(req.params.id).lean();
      return res.status(400).render('editCustomer', {
        customer: {
          ...(existing || {}),
          ...req.body,
          _id: req.params.id,
        },
        errorMessage: 'Another customer with the same name and phone number is already registered.',
      });
    }

    await Customers.findByIdAndUpdate(req.params.id, { ...req.body, phone: normalizePhone(req.body.phone) });
    await audit(req, { action: 'updated', entity: 'Customers', entityId: req.params.id, summary: `Updated details for ${req.body.firstName} ${req.body.lastName}.` });
    setFlash(req, 'Customer details updated successfully.');
    return res.redirect('/customers/records');
  } catch (error) {
    console.error('Failed to update customer:', error);
    const existing = await Customers.findById(req.params.id).lean();
    return res.status(400).render('editCustomer', {
      customer: {
        ...(existing || {}),
        ...req.body,
        _id: req.params.id,
      },
      errorMessage: 'Failed to update customer. Check your input and try again.',
    });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const blocker = await whyCustomerCannotBeDeleted(req.params.id);
    if (blocker) {
      setFlash(req, blocker, 'danger');
      return res.redirect('/customers/records');
    }
    const removed = await Customers.findByIdAndDelete(req.params.id);
    await audit(req, { action: 'deleted', entity: 'Customers', entityId: req.params.id, summary: `Deleted customer ${removed ? removed.firstName + ' ' + removed.lastName : 'unknown'}.` });
    setFlash(req, 'Customer deleted.');
    return res.redirect('/customers/records');
  } catch (error) {
    console.error('Failed to delete customer:', error);
    return res.status(500).send('Failed to delete customer.');
  }
};

export const getCustomerDetail = async (req, res) => {
  try {
    const customer = await Customers.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).send('Customer not found.');
    }

    const [vehicles, services] = await Promise.all([
      Vehicle.find({ customerId: customer._id }).sort({ createdAt: -1 }).lean(),
      ServiceRecord.find({ customer: customer._id })
        .populate('vehicle', 'registrationNo vehicleName')
        .populate('technicians', 'fullName')
        .sort({ date: -1 })
        .lean(),
    ]);

    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown Customer';

    return res.render('customerDetail', {
      customer,
      vehicles,
      services,
      fullName,
      initials: buildInitials(fullName),
    });
  } catch (error) {
    console.error('Failed to load customer detail:', error);
    return res.status(500).send('Failed to load customer detail.');
  }
};

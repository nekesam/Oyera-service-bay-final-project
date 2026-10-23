import User from '../models/User.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import Stock from '../models/Stock.mjs';
import Customers from '../models/Customers.mjs';
import Vehicle from '../models/Vehicle.mjs';
import { setFlash } from '../utils/flash.mjs';
import { DomainError, NotFoundError } from '../utils/errors.mjs';
import { dashboardPermissionsByRole } from './dashboardControllers.mjs';
import { normalizeArray } from '../services/pricing.mjs';
import * as serviceRecords from '../services/serviceRecordService.mjs';
import { audit } from '../services/auditService.mjs';
import { clearNotificationCache } from '../services/notificationService.mjs';
import { withBilling } from '../services/billing.mjs';
import { jobStatusCounts, moneySummary } from '../services/analytics.mjs';
import { paginate } from '../utils/paginate.mjs';
import { JOB_STATUSES, PAYMENT_METHODS } from '../config/business.mjs';

// Controllers only deal with HTTP: read the request, call a service, pick a page.
// Pricing, stock and validation rules live in /services. Errors thrown here (or in
// the services) reach middleware/errorHandler.mjs, so there is no try/catch noise.

const getRolePermissions = (role) => dashboardPermissionsByRole[role] || dashboardPermissionsByRole.Technician;

const TECHNICIAN_ROLES = ['Technician', 'Senior technician'];

const groupStockByCategory = (items) =>
  items.reduce((groups, item) => {
    (groups[item.category] ||= []).push(item);
    return groups;
  }, {});

const loadAddFormData = async () => {
  const [technicians, customers, vehicles, availableStock] = await Promise.all([
    User.find({ role: { $in: TECHNICIAN_ROLES } }).lean(),
    Customers.find().sort({ firstName: 1, lastName: 1 }).lean(),
    Vehicle.find().sort({ registrationNo: 1 }).lean(),
    Stock.find({ quantity: { $gt: 0 } }).lean(),
  ]);
  return { technicians, customers, vehicles, stockByCategory: groupStockByCategory(availableStock) };
};

const renderAddForm = async (res, { status = 200, errorMessage = null, body = {} } = {}) => {
  const data = await loadAddFormData();
  return res.status(status).render('add-record', {
    ...data,
    errorMessage,
    formData: {
      customer: body.customer || '',
      vehicle: body.vehicle || '',
      servicesDone: normalizeArray(body.servicesDone).filter(Boolean),
      technicians: normalizeArray(body.technicians).filter(Boolean),
    },
  });
};

const loadPopulatedRecord = (id) =>
  ServiceRecord.findById(id)
    .populate('customer', 'firstName lastName phone email')
    .populate('vehicle', 'registrationNo vehicleName vehicleType');

const renderEditForm = async (res, record, { status = 200, errorMessage = null } = {}) => {
  const [technicians, allStock] = await Promise.all([
    User.find({ role: { $in: TECHNICIAN_ROLES } }),
    Stock.find(),
  ]);
  return res.status(status).render('editServiceRecord', {
    record,
    technicians,
    stockByCategory: groupStockByCategory(allStock),
    errorMessage,
  });
};

export const getServiceForm = (req, res) => renderAddForm(res);

export const createServiceRecord = async (req, res) => {
  let created;
  try {
    if (req.serviceValidationErrors?.length) {
      throw new DomainError(req.serviceValidationErrors.join(' '));
    }
    created = await serviceRecords.createServiceRecord(req.body);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return renderAddForm(res, { status: error.status, errorMessage: error.message, body: req.body });
  }
  await audit(req, { action: 'created', entity: 'ServiceRecord', entityId: created._id, summary: `Created a service job totalling UGX ${created.totalCost.toLocaleString('en-US')}.` });
  clearNotificationCache();
  setFlash(req, 'Service record saved and stock levels updated.');
  return res.redirect('/records');
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PAYMENT_FILTERS = {
  Unpaid: { $expr: { $lte: [{ $sum: '$payments.amount' }, 0] } },
  Paid: { $expr: { $gte: [{ $sum: '$payments.amount' }, '$totalCost'] } },
  'Part paid': {
    $and: [{ $expr: { $gt: [{ $sum: '$payments.amount' }, 0] } }, { $expr: { $lt: [{ $sum: '$payments.amount' }, '$totalCost'] } }],
  },
};

// Turns the search box and the two drop-downs into one database filter.
const buildRecordFilter = async ({ q, status, payment }) => {
  const clauses = [];

  const text = String(q || '').trim();
  if (text) {
    // every word must match a first name, last name, plate or vehicle name ("cara cli" finds Cara Client)
    const words = text.split(/\s+/).map((word) => new RegExp(escapeRegex(word), 'i'));
    const [customers, vehicles] = await Promise.all([
      Customers.find({ $and: words.map((rx) => ({ $or: [{ firstName: rx }, { lastName: rx }] })) }).select('_id').lean(),
      Vehicle.find({ $and: words.map((rx) => ({ $or: [{ registrationNo: rx }, { vehicleName: rx }] })) }).select('_id').lean(),
    ]);
    clauses.push({ $or: [{ customer: { $in: customers.map((c) => c._id) } }, { vehicle: { $in: vehicles.map((v) => v._id) } }] });
  }

  if (JOB_STATUSES.includes(status)) {
    // jobs saved before statuses existed count as Collected
    clauses.push(status === 'Collected' ? { $or: [{ status: 'Collected' }, { status: { $exists: false } }] } : { status });
  }
  if (PAYMENT_FILTERS[payment]) clauses.push(PAYMENT_FILTERS[payment]);

  return clauses.length ? { $and: clauses } : {};
};

export const getAllRecords = async (req, res) => {
  const filters = {
    q: String(req.query.q || '').trim(),
    status: JOB_STATUSES.includes(req.query.status) ? req.query.status : '',
    payment: PAYMENT_FILTERS[req.query.payment] ? req.query.payment : '',
  };
  const filter = await buildRecordFilter(filters);

  const total = await ServiceRecord.countDocuments(filter);
  const pagination = paginate(req.query, total);
  const [records, summary, statusCounts, jobs] = await Promise.all([
    ServiceRecord.find(filter)
      .populate('customer', 'firstName lastName phone email')
      .populate('vehicle', 'registrationNo vehicleName vehicleType')
      .populate('technicians', 'fullName')
      .sort({ date: -1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .lean(),
    moneySummary(),
    jobStatusCounts(),
    ServiceRecord.estimatedDocumentCount(),
  ]);

  return res.render('records', {
    pageTitle: 'Services',
    records: records.map(withBilling),
    pagination,
    filters,
    summary: { ...summary, jobs },
    statusCounts,
    statuses: JOB_STATUSES,
    permissions: getRolePermissions(req.session?.userRole),
  });
};

export const getServiceRecordDetail = async (req, res) => {
  const record = await ServiceRecord.findById(req.params.id)
    .populate('customer', 'firstName lastName phone email address')
    .populate('vehicle', 'registrationNo vehicleName vehicleType color')
    .populate('technicians', 'fullName role')
    .populate('payments.receivedBy', 'fullName')
    .lean();
  if (!record) throw new NotFoundError('Service record not found.');
  return res.render('serviceRecordDetail', {
    pageTitle: 'Service record',
    record: withBilling(record),
    statuses: JOB_STATUSES,
    paymentMethods: PAYMENT_METHODS,
    canTakePayment: req.session?.userRole === 'Admin',
  });
};

export const getEditRecordForm = async (req, res) => {
  const record = await loadPopulatedRecord(req.params.id);
  if (!record) throw new NotFoundError('Service record not found.');
  return renderEditForm(res, record);
};

export const updateServiceRecord = async (req, res) => {
  try {
    if (req.serviceValidationErrors?.length) {
      throw new DomainError(req.serviceValidationErrors.join(' '));
    }
    await serviceRecords.updateServiceRecord(req.params.id, req.body);
  } catch (error) {
    if (!(error instanceof DomainError) || error instanceof NotFoundError) throw error;
    // Show the form again with what the user typed, plus the reason it failed
    const record = await loadPopulatedRecord(req.params.id);
    if (!record) throw new NotFoundError('Service record not found.');
    record.servicesDone = normalizeArray(req.body.servicesDone).filter(Boolean);
    record.technicians = normalizeArray(req.body.technicians).filter(Boolean);
    return renderEditForm(res, record, { status: error.status, errorMessage: error.message });
  }
  await audit(req, { action: 'updated', entity: 'ServiceRecord', entityId: req.params.id, summary: 'Edited a service job (services, parts, technicians or total).' });
  clearNotificationCache();
  setFlash(req, 'Service record updated.');
  return res.redirect('/records');
};

export const deleteServiceRecord = async (req, res) => {
  const removed = await serviceRecords.deleteServiceRecord(req.params.id);
  await audit(req, { action: 'deleted', entity: 'ServiceRecord', entityId: req.params.id, summary: `Deleted a service job that totalled UGX ${Number(removed.totalCost || 0).toLocaleString('en-US')}; its parts went back to stock.` });
  clearNotificationCache();
  setFlash(req, 'Service record deleted and stock restored.');
  return res.redirect('/records');
};

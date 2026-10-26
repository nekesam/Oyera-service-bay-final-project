import ServiceRecord from '../models/ServiceRecord.mjs';
import { setFlash } from '../utils/flash.mjs';
import { DomainError, NotFoundError } from '../utils/errors.mjs';
import { recordPayment, setJobStatus, withBilling } from '../services/billing.mjs';
import { audit } from '../services/auditService.mjs';
import { clearNotificationCache } from '../services/notificationService.mjs';
import { dashboardPermissionsByRole } from './dashboardControllers.mjs';

const formatUGX = (value) => `UGX ${Number(value).toLocaleString('en-US')}`;

// Only allow redirecting back to a page on THIS site (stops "open redirect" tricks).
const safeReturnTo = (value, fallback) => (typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : fallback);

export const addPayment = async (req, res) => {
  const back = `/records/${req.params.id}`;
  try {
    const record = await recordPayment(req.params.id, req.body, req.session.userId);
    await audit(req, {
      action: 'payment',
      entity: 'ServiceRecord',
      entityId: record._id,
      summary: `Recorded a ${req.body.method} payment of ${formatUGX(req.body.amount)}.`,
    });
    clearNotificationCache();
    setFlash(req, `Payment of ${formatUGX(req.body.amount)} recorded.`);
  } catch (error) {
    if (!(error instanceof DomainError) || error instanceof NotFoundError) throw error;
    setFlash(req, error.message, 'danger');
  }
  return res.redirect(back);
};

export const updateJobStatus = async (req, res) => {
  const back = safeReturnTo(req.body.returnTo, `/records/${req.params.id}`);
  try {
    const record = await setJobStatus(req.params.id, req.body.status);
    await audit(req, {
      action: 'status',
      entity: 'ServiceRecord',
      entityId: record._id,
      summary: `Changed the job status to "${record.status}".`,
    });
    clearNotificationCache();
    setFlash(req, `Job marked "${record.status}".`);
  } catch (error) {
    if (!(error instanceof DomainError) || error instanceof NotFoundError) throw error;
    setFlash(req, error.message, 'danger');
  }
  return res.redirect(back);
};

export const getInvoice = async (req, res) => {
  const record = await ServiceRecord.findById(req.params.id)
    .populate('customer', 'firstName lastName phone email address')
    .populate('vehicle', 'registrationNo vehicleName vehicleType color')
    .populate('technicians', 'fullName')
    .populate('payments.receivedBy', 'fullName')
    .lean();
  if (!record) throw new NotFoundError('Service record not found.');
  return res.render('invoice', { pageTitle: 'Invoice', record: withBilling(record) });
};

// The jobs assigned to the logged-in person that are not finished yet.
export const getMyJobs = async (req, res) => {
  const jobs = await ServiceRecord.find({ technicians: req.session.userId, status: { $ne: 'Collected' } })
    .populate('customer', 'firstName lastName phone')
    .populate('vehicle', 'registrationNo vehicleName')
    .sort({ date: -1 })
    .lean();
  return res.render('myJobs', {
    pageTitle: 'My jobs',
    jobs: jobs.map(withBilling),
    permissions: dashboardPermissionsByRole[req.session.userRole] || dashboardPermissionsByRole.Technician,
  });
};

import ServiceRecord from '../models/ServiceRecord.mjs';
import { JOB_STATUSES, LEGACY_JOB_STATUS, PAYMENT_METHODS } from '../config/business.mjs';
import { DomainError, NotFoundError } from '../utils/errors.mjs';

const formatUGX = (value) => `UGX ${Number(value).toLocaleString('en-US')}`;

// ---------- reading a bill ----------

export const amountPaid = (record) => (record.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

export const balanceDue = (record) => Math.max(0, (Number(record.totalCost) || 0) - amountPaid(record));

export const paymentStatus = (record) => {
  const paid = amountPaid(record);
  if (paid <= 0) return 'Unpaid';
  return paid >= (Number(record.totalCost) || 0) ? 'Paid' : 'Part paid';
};

export const jobStatus = (record) => record.status || LEGACY_JOB_STATUS;

// Adds the computed fields the pages need.
export const withBilling = (record) => {
  const plain = typeof record.toObject === 'function' ? record.toObject() : record;
  return { ...plain, amountPaid: amountPaid(plain), balanceDue: balanceDue(plain), paymentStatus: paymentStatus(plain), jobStatus: jobStatus(plain) };
};

// ---------- taking a payment ----------

// The "not more than the balance" check and the push happen in ONE database operation,
// so two cashiers cannot both record the last payment and overpay the bill.
export const recordPayment = async (recordId, { amount, method, note }, receivedBy) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new DomainError('Enter the payment as a whole number of UGX greater than zero.');
  }
  if (!PAYMENT_METHODS.includes(method)) {
    throw new DomainError('Choose how the customer paid.');
  }

  const updated = await ServiceRecord.findOneAndUpdate(
    {
      _id: recordId,
      $expr: { $lte: [{ $add: [{ $sum: '$payments.amount' }, value] }, '$totalCost'] },
    },
    { $push: { payments: { amount: value, method, note: String(note || '').trim().slice(0, 200), receivedBy, date: new Date() } } },
    { returnDocument: 'after' },
  );

  if (!updated) {
    const record = await ServiceRecord.findById(recordId).lean();
    if (!record) throw new NotFoundError('Service record not found.');
    throw new DomainError(`That is more than the balance. This job only has ${formatUGX(balanceDue(record))} left to pay.`, 409);
  }
  return updated;
};

// ---------- job status ----------

export const setJobStatus = async (recordId, status) => {
  if (!JOB_STATUSES.includes(status)) throw new DomainError('That job status is not valid.');
  const record = await ServiceRecord.findByIdAndUpdate(recordId, { status }, { returnDocument: 'after' });
  if (!record) throw new NotFoundError('Service record not found.');
  return record;
};

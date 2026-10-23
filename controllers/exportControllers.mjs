import ServiceRecord from '../models/ServiceRecord.mjs';
import Stock from '../models/Stock.mjs';
import Customers from '../models/Customers.mjs';
import { toCsv } from '../services/csv.mjs';
import { withBilling } from '../services/billing.mjs';
import { isLowStock } from '../services/inventoryService.mjs';

const today = () => new Date().toISOString().slice(0, 10);

const sendCsv = (res, name, csv) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${today()}.csv"`);
  return res.send(csv);
};

const fullName = (person) => (person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() : '');

export const exportServices = async (req, res) => {
  const records = await ServiceRecord.find()
    .populate('customer', 'firstName lastName phone')
    .populate('vehicle', 'registrationNo vehicleName')
    .populate('technicians', 'fullName')
    .sort({ date: -1 })
    .lean();

  return sendCsv(
    res,
    'service-records',
    toCsv(records.map(withBilling), [
      { header: 'Date', value: (r) => new Date(r.date).toISOString().slice(0, 10) },
      { header: 'Customer', value: (r) => fullName(r.customer) },
      { header: 'Phone', value: (r) => r.customer?.phone },
      { header: 'Plate', value: (r) => r.vehicle?.registrationNo },
      { header: 'Vehicle', value: (r) => r.vehicle?.vehicleName },
      { header: 'Services', value: (r) => (r.servicesDone || []).join('; ') },
      { header: 'Parts', value: (r) => (r.partsUsed || []).map((p) => `${p.itemName} x${p.quantity}`).join('; ') },
      { header: 'Technicians', value: (r) => (r.technicians || []).map((t) => t.fullName).join('; ') },
      { header: 'Job status', value: (r) => r.jobStatus },
      { header: 'Total (UGX)', value: (r) => r.totalCost },
      { header: 'Paid (UGX)', value: (r) => r.amountPaid },
      { header: 'Balance (UGX)', value: (r) => r.balanceDue },
      { header: 'Payment status', value: (r) => r.paymentStatus },
    ]),
  );
};

export const exportStock = async (req, res) => {
  const items = await Stock.find().sort({ itemName: 1 }).lean();
  return sendCsv(
    res,
    'stock',
    toCsv(items, [
      { header: 'Stock ID', value: (i) => i.stockId },
      { header: 'Item', value: (i) => i.itemName },
      { header: 'Category', value: (i) => i.category },
      { header: 'Supplier', value: (i) => i.supplier },
      { header: 'Quantity', value: (i) => i.quantity },
      { header: 'Unit', value: (i) => i.unit },
      { header: 'Unit price (UGX)', value: (i) => i.unitPrice },
      { header: 'Stock value (UGX)', value: (i) => (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) },
      { header: 'Low stock', value: (i) => (isLowStock(i) ? 'Yes' : 'No') },
      { header: 'Location', value: (i) => i.storageLocation },
    ]),
  );
};

export const exportCustomers = async (req, res) => {
  const customers = await Customers.find().sort({ lastName: 1, firstName: 1 }).lean();
  return sendCsv(
    res,
    'customers',
    toCsv(customers, [
      { header: 'First name', value: (c) => c.firstName },
      { header: 'Last name', value: (c) => c.lastName },
      { header: 'Phone', value: (c) => c.phone },
      { header: 'Email', value: (c) => c.email },
      { header: 'Address', value: (c) => c.address },
    ]),
  );
};

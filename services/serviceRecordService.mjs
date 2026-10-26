import Customers from '../models/Customers.mjs';
import Vehicle from '../models/Vehicle.mjs';
import Stock from '../models/Stock.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import { LABOUR_CHARGE } from '../config/pricing.mjs';
import { DomainError, NotFoundError } from '../utils/errors.mjs';
import { buildLineItems, mergeRequestedParts, normalizeArray } from './pricing.mjs';
import { amountPaid } from './billing.mjs';
import { diffParts, normalizeParts, releaseStock, reserveStock } from './stockService.mjs';

// A vehicle's "last service" is simply the date of its newest job. Recomputing it (instead of
// just setting it) stays correct when a job is edited or deleted.
export const syncVehicleLastService = async (vehicleId) => {
  if (!vehicleId) return;
  const newest = await ServiceRecord.findOne({ vehicle: vehicleId }).sort({ date: -1 }).select('date').lean();
  await Vehicle.updateOne({ _id: vehicleId }, { lastService: newest ? newest.date : null });
};

// The vehicle must really belong to the chosen customer.
const assertCustomerOwnsVehicle = async (customerId, vehicleId) => {
  const customer = await Customers.findById(customerId).select('_id');
  if (!customer) throw new DomainError('Selected customer was not found.');
  const vehicle = await Vehicle.findOne({ _id: vehicleId, customerId });
  if (!vehicle) throw new DomainError('The selected vehicle does not belong to the selected customer.');
};

// Turns the form input into everything we store: parts used and the itemised bill.
const priceJob = async ({ servicesDone, partIds, partQuantities }) => {
  const parts = [];
  for (const [stockId, quantity] of mergeRequestedParts(partIds, partQuantities)) {
    const stockItem = await Stock.findById(stockId);
    if (!stockItem) throw new DomainError('A selected stock item no longer exists. Please refresh and try again.');
    parts.push({ stockItem, quantity });
  }

  const { lineItems, totalCost } = buildLineItems({ servicesDone, parts });
  const partsUsed = lineItems
    .filter((line) => line.type === 'part')
    .map((line) => ({ stockId: line.stockId, itemName: line.description, quantity: line.quantity, unitPrice: line.unitPrice }));

  return { lineItems, partsUsed, totalCost };
};

export const createServiceRecord = async (input) => {
  await assertCustomerOwnsVehicle(input.customer, input.vehicle);
  const { lineItems, partsUsed, totalCost } = await priceJob(input);

  await reserveStock(partsUsed);
  try {
    const created = await ServiceRecord.create({
      customer: input.customer,
      vehicle: input.vehicle,
      servicesDone: normalizeArray(input.servicesDone).filter(Boolean),
      technicians: normalizeArray(input.technicians).filter(Boolean),
      labourCharge: LABOUR_CHARGE,
      partsUsed,
      lineItems,
      totalCost,
      status: 'In progress',
    });
    await syncVehicleLastService(created.vehicle);
    return created;
  } catch (error) {
    await releaseStock(partsUsed); // saving failed, so give the stock back
    throw error;
  }
};

export const updateServiceRecord = async (id, input) => {
  const record = await ServiceRecord.findById(id);
  if (!record) throw new NotFoundError('Service record not found.');

  await assertCustomerOwnsVehicle(input.customer, input.vehicle);
  const { lineItems, partsUsed, totalCost } = await priceJob(input);

  // Payments already taken must still be covered by the new total
  const paid = amountPaid(record);
  if (totalCost < paid) {
    throw new DomainError(`This job already has UGX ${paid.toLocaleString('en-US')} paid, which is more than the new total of UGX ${totalCost.toLocaleString('en-US')}. Refund or adjust the payment first.`, 409);
  }

  const oldParts = await normalizeParts(record.partsUsed);
  const oldVehicle = record.vehicle;
  const { increase, decrease } = diffParts(oldParts, partsUsed);

  await reserveStock(increase); // take only the extra parts, all or nothing
  try {
    record.set({
      customer: input.customer,
      vehicle: input.vehicle,
      servicesDone: normalizeArray(input.servicesDone).filter(Boolean),
      technicians: normalizeArray(input.technicians).filter(Boolean),
      labourCharge: LABOUR_CHARGE,
      partsUsed,
      lineItems,
      totalCost,
    });
    await record.save();
  } catch (error) {
    await releaseStock(increase);
    throw error;
  }
  await releaseStock(decrease); // parts removed from the job go back on the shelf
  await syncVehicleLastService(oldVehicle);
  await syncVehicleLastService(record.vehicle);
  return record;
};

export const deleteServiceRecord = async (id) => {
  const record = await ServiceRecord.findById(id);
  if (!record) throw new NotFoundError('Service record not found.');
  const parts = await normalizeParts(record.partsUsed);
  await record.deleteOne();
  await releaseStock(parts);
  await syncVehicleLastService(record.vehicle);
  return record;
};

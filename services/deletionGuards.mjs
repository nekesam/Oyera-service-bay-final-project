import Vehicle from '../models/Vehicle.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';

// Deleting something that old service records point to would leave those records
// with missing names and break stock restoring. These helpers say WHY a delete is not allowed.
// Each returns a sentence to show the user, or null when deleting is safe.

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const whyCustomerCannotBeDeleted = async (customerId) => {
  const [vehicles, records] = await Promise.all([
    Vehicle.countDocuments({ customerId }),
    ServiceRecord.countDocuments({ customer: customerId }),
  ]);
  if (!vehicles && !records) return null;
  const parts = [vehicles && plural(vehicles, 'vehicle'), records && plural(records, 'service record')].filter(Boolean);
  return `This customer cannot be deleted because they still have ${parts.join(' and ')}.`;
};

export const whyVehicleCannotBeDeleted = async (vehicleId) => {
  const records = await ServiceRecord.countDocuments({ vehicle: vehicleId });
  return records ? `This vehicle cannot be deleted because it has ${plural(records, 'service record')}.` : null;
};

export const whyStockCannotBeDeleted = async (stockId) => {
  const records = await ServiceRecord.countDocuments({ 'partsUsed.stockId': stockId });
  return records ? `This stock item cannot be deleted because it was used in ${plural(records, 'service record')}.` : null;
};

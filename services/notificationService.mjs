import ServiceRecord from '../models/ServiceRecord.mjs';
import Vehicle from '../models/Vehicle.mjs';
import { findLowStock } from './inventoryService.mjs';
import { serviceDueCutoff } from './vehicleService.mjs';

// The bell in the top bar and the counts in the sidebar come from here.
// Results are cached for a short time so a busy day does not run these queries on every page load.
const CACHE_MS = 30_000;
let cache = { at: 0, data: null };

export const clearNotificationCache = () => {
  cache = { at: 0, data: null };
};

const compute = async () => {
  const [lowStock, readyForPickup, [unpaid], vehiclesDue] = await Promise.all([
    findLowStock(50),
    ServiceRecord.countDocuments({ status: 'Ready for pickup' }),
    ServiceRecord.aggregate([
      { $match: { $expr: { $lt: [{ $sum: '$payments.amount' }, '$totalCost'] } } },
      { $count: 'count' },
    ]),
    Vehicle.countDocuments({ $expr: { $lt: [{ $ifNull: ['$lastService', '$createdAt'] }, serviceDueCutoff()] } }),
  ]);
  return { lowStock, readyForPickup, unpaid: unpaid?.count || 0, vehiclesDue };
};

const getRaw = async () => {
  if (!cache.data || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), data: await compute() };
  }
  return cache.data;
};

// Builds the list shown in the bell for this person. Only Admin sees money items.
export const getNotifications = async (role) => {
  const { lowStock, readyForPickup, unpaid, vehiclesDue } = await getRaw();
  const items = [];

  if (lowStock.length) {
    const names = lowStock.slice(0, 3).map((i) => i.itemName).join(', ');
    items.push({
      tone: 'orange',
      icon: 'fa-box',
      title: `${lowStock.length} item${lowStock.length === 1 ? '' : 's'} running low`,
      text: lowStock.length > 3 ? `${names} and ${lowStock.length - 3} more` : names,
      href: '/registerStock/stockList',
    });
  }
  if (readyForPickup) {
    items.push({
      tone: 'green',
      icon: 'fa-car-side',
      title: `${readyForPickup} vehicle${readyForPickup === 1 ? '' : 's'} ready for pickup`,
      text: 'Customers can collect these now.',
      href: '/records?status=Ready%20for%20pickup',
    });
  }
  if (vehiclesDue) {
    items.push({
      tone: 'orange',
      icon: 'fa-wrench',
      title: `${vehiclesDue} vehicle${vehiclesDue === 1 ? '' : 's'} due for service`,
      text: 'Not serviced for six months or more.',
      href: '/vehicles',
    });
  }
  if (unpaid && role === 'Admin') {
    items.push({
      tone: 'blue',
      icon: 'fa-coins',
      title: `${unpaid} job${unpaid === 1 ? '' : 's'} with a balance to collect`,
      text: 'Open the list to record payments.',
      href: '/records?payment=Unpaid',
    });
  }

  return { items, counts: { lowStock: lowStock.length, readyForPickup, vehiclesDue } };
};

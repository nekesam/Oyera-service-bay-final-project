import ServiceRecord from '../models/ServiceRecord.mjs';

// Numbers for the dashboard charts. Everything is worked out inside MongoDB.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Revenue and job count for each of the last `months` months (months with no jobs show 0).
export const revenueByMonth = async (months = 6, now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await ServiceRecord.aggregate([
    { $match: { date: { $gte: start } } },
    { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' } }, revenue: { $sum: '$totalCost' }, jobs: { $sum: 1 } } },
  ]);
  const byKey = new Map(rows.map((r) => [`${r._id.y}-${r._id.m}`, r]));
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    const hit = byKey.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
    return { label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, revenue: hit?.revenue || 0, jobs: hit?.jobs || 0 };
  });
};

// The most-used parts, by quantity.
export const topParts = async (limit = 5) =>
  ServiceRecord.aggregate([
    { $unwind: '$partsUsed' },
    { $group: { _id: '$partsUsed.itemName', quantity: { $sum: '$partsUsed.quantity' }, revenue: { $sum: { $multiply: ['$partsUsed.quantity', { $ifNull: ['$partsUsed.unitPrice', 0] }] } } } },
    { $sort: { quantity: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, name: '$_id', quantity: 1, revenue: 1 } },
  ]);

// How many jobs each technician is on.
export const technicianWorkload = async (limit = 6) =>
  ServiceRecord.aggregate([
    { $unwind: '$technicians' },
    { $group: { _id: '$technicians', jobs: { $sum: 1 } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $project: { _id: 0, name: { $ifNull: [{ $arrayElemAt: ['$user.fullName', 0] }, 'Unknown'] }, jobs: 1 } },
    { $sort: { jobs: -1, name: 1 } },
    { $limit: limit },
  ]);

// Jobs in each stage. Old jobs without a status count as Collected.
export const jobStatusCounts = async () => {
  const rows = await ServiceRecord.aggregate([{ $group: { _id: { $ifNull: ['$status', 'Collected'] }, count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
};

// Money billed, money received, and money still owed.
export const moneySummary = async () => {
  const [row] = await ServiceRecord.aggregate([
    { $project: { totalCost: 1, paid: { $sum: '$payments.amount' } } },
    { $group: { _id: null, billed: { $sum: '$totalCost' }, received: { $sum: { $min: ['$paid', '$totalCost'] } } } },
  ]);
  const billed = row?.billed || 0;
  const received = row?.received || 0;
  return { billed, received, outstanding: Math.max(0, billed - received) };
};

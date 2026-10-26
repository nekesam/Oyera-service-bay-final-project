import ServiceRecord from "../models/ServiceRecord.mjs";
import Stock from "../models/Stock.mjs";
import User from "../models/User.mjs";
import Customers from "../models/Customers.mjs";
import Vehicle from "../models/Vehicle.mjs";
import { withBilling } from "../services/billing.mjs";
import { findLowStock } from "../services/inventoryService.mjs";
import { jobStatusCounts, moneySummary, revenueByMonth, technicianWorkload, topParts } from "../services/analytics.mjs";
import { JOB_STATUSES } from "../config/business.mjs";

export const dashboardPermissionsByRole = {
Admin: {
showCustomers: true,
showVehicles: true,
canManageVehicles: true,
showServices: true,
showServiceRegistration: true,
canManageServices: true,
showTechnicians: true,
canManageTechnicians: true,
showInventory: true,
canManageStock: true,
showPayments: true,
showReports: true,
showSettings: true,
showQuickServiceEntry: true,
},

"Senior technician": {
showCustomers: true,
showVehicles: true,
canManageVehicles: true,
showServices: true,
showServiceRegistration: true,
canManageServices: true,
showTechnicians: true,
canManageTechnicians: false,
showInventory: true,
canManageStock: true,
showPayments: false,
showReports: true,
showQuickServiceEntry: true,
},

Technician: {
showCustomers: false,
showVehicles: true,
canManageVehicles: false,
showServices: true,
showServiceRegistration: true,
canManageServices: true,
showTechnicians: true,
canManageTechnicians: false,
showInventory: true,
canManageStock: false,
showPayments: false,
showReports: false,
showSettings: false,
showQuickServiceEntry: true,
},
};

const getRolePermissions = (role) => {
return (
dashboardPermissionsByRole[role] ||
dashboardPermissionsByRole.Technician
);
};

const toNumber = (value) => {
const parsed = Number(value);
return Number.isFinite(parsed) ? parsed : 0;
};

export const getDashboard = async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [
    recentRecords,
    jobsToday,
    todayMoney,
    customers,
    vehicles,
    stockValue,
    lowStock,
    money,
    months,
    parts,
    workload,
    statusCounts,
  ] = await Promise.all([
    ServiceRecord.find()
      .populate('customer', 'firstName lastName')
      .populate('vehicle', 'registrationNo vehicleName')
      .populate('technicians', 'fullName')
      .sort({ date: -1 })
      .limit(6)
      .lean(),
    ServiceRecord.countDocuments({ date: { $gte: todayStart, $lt: tomorrowStart } }),
    ServiceRecord.aggregate([
      { $match: { date: { $gte: todayStart, $lt: tomorrowStart } } },
      { $group: { _id: null, revenue: { $sum: '$totalCost' } } },
    ]),
    Customers.countDocuments(),
    Vehicle.countDocuments(),
    Stock.aggregate([
      { $group: { _id: null, value: { $sum: { $multiply: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$unitPrice', 0] }] } } } },
    ]),
    findLowStock(6),
    moneySummary(),
    revenueByMonth(6),
    topParts(5),
    technicianWorkload(5),
    jobStatusCounts(),
  ]);

  const permissions = getRolePermissions(req.session?.userRole);
  const activeJobs = (statusCounts.Booked || 0) + (statusCounts['In progress'] || 0) + (statusCounts['Ready for pickup'] || 0);

  const stats = {
    activeJobs,
    jobsToday,
    todayRevenue: toNumber(todayMoney[0]?.revenue),
    customers,
    vehicles,
    inventoryValue: toNumber(stockValue[0]?.value),
    ...money,
  };

  // Data for the browser charts. "<" is escaped so a stock name can never close the <script> tag.
  const charts = { months, statusCounts, statusOrder: JOB_STATUSES };
  const chartsJson = JSON.stringify(charts).replace(/</g, '\\u003c');

  return res.render('dashboard', {
    pageTitle: 'Dashboard',
    stats,
    recentRecords: recentRecords.map(withBilling),
    lowStock,
    parts,
    workload,
    chartsJson,
    permissions,
  });
};

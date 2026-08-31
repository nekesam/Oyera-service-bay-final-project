import ServiceRecord from "../models/ServiceRecord.mjs";
import Stock from "../models/Stock.mjs";
import User from "../models/User.mjs";
import Customers from "../models/Customers.mjs";

export const dashboardPermissionsByRole = {
Admin: {
showCustomers: true,
showVehicles: true,
canManageVehicles: true,
showServices: true,
showServiceRegistration: true,
canManageServices: true,
showTechnicians: true,
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
showTechnicians: false,
showInventory: true,
canManageStock: true,
showPayments: false,
showReports: true,
showSettings: false,
showQuickServiceEntry: true,
},

Technician: {
showCustomers: false,
showVehicles: true,
canManageVehicles: false,
showServices: true,
showServiceRegistration: true,
canManageServices: true,
showTechnicians: false,
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
try {

	//today's date range

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

const tomorrowStart = new Date(todayStart);
tomorrowStart.setDate(tomorrowStart.getDate() + 1);

//fetch from database
const [
  recentRecords,
  recentStockItems,
  totalServiceRecords,
  totalCustomers,
  totalUsers,
  totalStockItems,
  distinctVehicles,
  todayCars,
  totalRevenueAggregation,
  todayRevenueAggregation,
  partsSoldAggregation,
  stockValueAggregation,
] = await Promise.all([

 
  ServiceRecord.find()
    .populate(
      "customer",
      "firstName lastName phone email"
    )
    .populate(
      "vehicle",
      "registrationNo vehicleName vehicleType"
    )
    .populate(
      "technicians",
      "fullName"
    )
    .sort({ date: -1 })
    .limit(5),

  Stock.find()
    .sort({ date: -1, createdAt: -1 })
    .limit(5),

  ServiceRecord.countDocuments(),

  Customers.countDocuments(),

  User.countDocuments(),

  Stock.countDocuments(),

  ServiceRecord.distinct("vehicle"),

  ServiceRecord.countDocuments({
    date: {
      $gte: todayStart,
      $lt: tomorrowStart,
    },
  }),

  
  ServiceRecord.aggregate([
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: "$totalCost",
        },
      },
    },
  ]),

  
  ServiceRecord.aggregate([
    {
      $match: {
        date: {
          $gte: todayStart,
          $lt: tomorrowStart,
        },
      },
    },
    {
      $group: {
        _id: null,
        todayRevenue: {
          $sum: "$totalCost",
        },
      },
    },
  ]),

  
  ServiceRecord.aggregate([
    {
      $unwind: {
        path: "$partsUsed",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: null,
        partsSold: {
          $sum: "$partsUsed.quantity",
        },
      },
    },
  ]),

  
  Stock.aggregate([
    {
      $group: {
        _id: null,
        totalInventoryValue: {
          $sum: {
            $multiply: [
              {
                $ifNull: ["$quantity", 0],
              },
              {
                $ifNull: ["$unitPrice", 0],
              },
            ],
          },
        },
      },
    },
  ]),
]);


const totalRevenue = toNumber(
  totalRevenueAggregation[0]?.totalRevenue
);

const todayRevenue = toNumber(
  todayRevenueAggregation[0]?.todayRevenue
);

const partsSold = toNumber(
  partsSoldAggregation[0]?.partsSold
);

const inventoryValue = toNumber(
  stockValueAggregation[0]?.totalInventoryValue
);

const totalCars = distinctVehicles.length;

const dashboardStats = {
  totalRevenue,
  todayRevenue,

  totalCars,

  carsToday: todayCars,

  activeJobs: totalServiceRecords,

  totalCustomers,

  totalUsers,

  totalStockItems,

  partsSold,

  inventoryValue,
};

const role = req.session?.userRole;

const permissions = getRolePermissions(role);

return res.render("dashboard", {
  dashboardStats,
  recentRecords,
  recentStockItems,
  permissions,
});

} catch (error) {
console.error(
"Error fetching dashboard data:",
error
);

return res
  .status(500)
  .send("Error loading dashboard metrics");


}
};

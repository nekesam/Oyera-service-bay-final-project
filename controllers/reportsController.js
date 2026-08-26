import mongoose from 'mongoose';
import Customers from '../models/Customers.mjs';
import Vehicle from '../models/Vehicle.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import Stock from '../models/Stock.mjs';
import User from '../models/User.mjs';

const DEFAULT_SERVICE_TYPES = [
  'Engine Oil and Filters',
  'Gear Box Oil and Filters',
  'Brake Fluids',
  'Brake Pads Change',
  'Greasing',
  'Wheel Alignment',
  'Wheel Balance',
  'Other Minor Repairs'
];

const normalizePlate = (value) => String(value || '').trim().toUpperCase();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDateRangeFromPreset = (datePreset, customStartDate, customEndDate) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (datePreset === 'today') {
    return { start, end };
  }

  if (datePreset === 'week') {
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (datePreset === 'month') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (datePreset === 'custom' && customStartDate && customEndDate) {
    const customStart = new Date(customStartDate);
    const customEnd = new Date(customEndDate);

    if (!Number.isNaN(customStart.getTime()) && !Number.isNaN(customEnd.getTime())) {
      customStart.setHours(0, 0, 0, 0);
      customEnd.setHours(23, 59, 59, 999);
      return { start: customStart, end: customEnd };
    }
  }

  return null;
};

const stockStatusFromQuantity = (quantity) => {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity <= 10) return 'Low Stock';
  return 'In Stock';
};

export const getReportsPage = async (req, res) => {
  try {
    const datePreset = String(req.query.datePreset || 'month');
    const serviceType = String(req.query.serviceType || 'all');
    const vehicleType = String(req.query.vehicleType || 'all');
    const technicianId = String(req.query.technicianId || 'all');
    const customStartDate = req.query.customStartDate || '';
    const customEndDate = req.query.customEndDate || '';

    const serviceMatch = {};

    const selectedRange = getDateRangeFromPreset(datePreset, customStartDate, customEndDate);
    if (selectedRange) {
      serviceMatch.date = { $gte: selectedRange.start, $lte: selectedRange.end };
    }

    if (serviceType !== 'all') {
      serviceMatch.servicesDone = serviceType;
    }

    if (technicianId !== 'all' && mongoose.Types.ObjectId.isValid(technicianId)) {
      serviceMatch.technicians = new mongoose.Types.ObjectId(technicianId);
    }

    const [
      totalCustomers,
      serviceTypeOptionsFromDb,
      technicianOptions,
      stockItems,
      servicesRaw,
      vehiclesRaw
    ] = await Promise.all([
      Customers.countDocuments(),
      ServiceRecord.distinct('servicesDone'),
      User.find({ role: { $in: ['Technician', 'Senior technician'] } })
        .select('_id fullName')
        .sort({ fullName: 1 })
        .lean(),
      Stock.find().select('itemName quantity unit unitPrice').lean(),
      ServiceRecord.find(serviceMatch)
        .populate('technicians', 'fullName')
        .sort({ date: -1 })
        .lean(),
      Vehicle.find().select('registrationNo ownerName vehicleType').lean()
    ]);

    const vehicleByPlate = new Map(
      vehiclesRaw.map((vehicle) => [normalizePlate(vehicle.registrationNo), vehicle])
    );

    let filteredServices = servicesRaw;

    if (vehicleType !== 'all') {
      filteredServices = filteredServices.filter((record) => {
        const plate = normalizePlate(record.carPlate);
        const vehicle = vehicleByPlate.get(plate);
        return vehicle && vehicle.vehicleType === vehicleType;
      });
    }

    const totalServices = filteredServices.length;
    const totalRevenue = filteredServices.reduce((sum, record) => sum + toNumber(record.totalCost), 0);

    const distinctPlates = new Set(
      filteredServices.map((record) => normalizePlate(record.carPlate)).filter(Boolean)
    );
    const totalVehicles = distinctPlates.size;

    const partsUsedMap = new Map();
    let totalPartsUsed = 0;
    let labourCharges = 0;

    for (const record of filteredServices) {
      labourCharges += toNumber(record.labourCharge);
      for (const part of record.partsUsed || []) {
        const itemName = String(part.itemName || '').trim();
        const qty = toNumber(part.quantity);
        if (!itemName || qty <= 0) continue;

        totalPartsUsed += qty;
        partsUsedMap.set(itemName, (partsUsedMap.get(itemName) || 0) + qty);
      }
    }

    const stockPriceMap = new Map();
    const stockQuantityMap = new Map();
    const stockUnitMap = new Map();

    for (const stockItem of stockItems) {
      const itemName = String(stockItem.itemName || '').trim();
      if (!itemName) continue;

      stockPriceMap.set(itemName, toNumber(stockItem.unitPrice));
      stockQuantityMap.set(itemName, toNumber(stockItem.quantity));
      stockUnitMap.set(itemName, stockItem.unit || 'Units');
    }

    let partsRevenue = 0;
    for (const [itemName, quantityUsed] of partsUsedMap.entries()) {
      const price = stockPriceMap.get(itemName) || 0;
      partsRevenue += quantityUsed * price;
    }

    const serviceRevenue = Math.max(totalRevenue - labourCharges - partsRevenue, 0);

    const serviceReports = filteredServices.map((record) => {
      const partSummary = (record.partsUsed || [])
        .filter((part) => part && part.itemName)
        .map((part) => `${part.itemName} (${toNumber(part.quantity)})`)
        .join(', ');

      return {
        date: record.date,
        customer: record.customerName || '-',
        vehicle: record.carPlate || '-',
        services: (record.servicesDone || []).join(', '),
        technician: (record.technicians || []).map((tech) => tech.fullName || 'Unknown').join(', ') || '-',
        partsUsed: partSummary || '-',
        amount: toNumber(record.totalCost)
      };
    });

    const serviceCountByPlate = new Map();
    const lastServiceByPlate = new Map();

    for (const record of filteredServices) {
      const plate = normalizePlate(record.carPlate);
      if (!plate) continue;

      serviceCountByPlate.set(plate, (serviceCountByPlate.get(plate) || 0) + 1);

      const currentLast = lastServiceByPlate.get(plate);
      const recordDate = new Date(record.date);
      if (!currentLast || recordDate > currentLast) {
        lastServiceByPlate.set(plate, recordDate);
      }
    }

    const vehicleReports = [];
    for (const plate of distinctPlates) {
      const vehicle = vehicleByPlate.get(plate);
      const count = serviceCountByPlate.get(plate) || 0;
      const lastServiceDate = lastServiceByPlate.get(plate) || null;

      if (vehicleType !== 'all' && vehicle && vehicle.vehicleType !== vehicleType) {
        continue;
      }

      vehicleReports.push({
        registrationNo: plate,
        vehicleType: vehicle?.vehicleType || 'unknown',
        ownerName: vehicle?.ownerName || 'Unknown',
        servicesCount: count,
        lastServiceDate
      });
    }

    vehicleReports.sort((a, b) => b.servicesCount - a.servicesCount);

    const technicianStats = new Map();
    for (const record of filteredServices) {
      const servicesCount = (record.servicesDone || []).length || 1;
      const totalCost = toNumber(record.totalCost);

      for (const tech of record.technicians || []) {
        const techId = String(tech._id || tech);
        if (!technicianStats.has(techId)) {
          technicianStats.set(techId, {
            jobsHandled: 0,
            servicesCompleted: 0,
            totalServiceValue: 0
          });
        }

        const stat = technicianStats.get(techId);
        stat.jobsHandled += 1;
        stat.servicesCompleted += servicesCount;
        stat.totalServiceValue += totalCost;
      }
    }

    const technicianNameMap = new Map(
      technicianOptions.map((tech) => [String(tech._id), tech.fullName])
    );

    let technicianReports = Array.from(technicianStats.entries()).map(([id, stat]) => ({
      technicianId: id,
      technicianName: technicianNameMap.get(id) || 'Unknown Technician',
      jobsHandled: stat.jobsHandled,
      servicesCompleted: stat.servicesCompleted,
      totalServiceValue: stat.totalServiceValue
    }));

    technicianReports.sort((a, b) => b.jobsHandled - a.jobsHandled);

    if (technicianId !== 'all') {
      technicianReports = technicianReports.filter((item) => item.technicianId === technicianId);
    }

    const inventoryItemNames = new Set([
      ...Array.from(partsUsedMap.keys()),
      ...stockItems.map((item) => String(item.itemName || '').trim()).filter(Boolean)
    ]);

    const inventoryReports = Array.from(inventoryItemNames).map((itemName) => {
      const quantityUsed = partsUsedMap.get(itemName) || 0;
      const currentQuantity = stockQuantityMap.get(itemName) || 0;
      const unit = stockUnitMap.get(itemName) || 'Units';
      const stockStatus = stockStatusFromQuantity(currentQuantity);

      return {
        itemName,
        quantityUsed,
        currentQuantity,
        unit,
        stockStatus
      };
    });

    inventoryReports.sort((a, b) => b.quantityUsed - a.quantityUsed || a.itemName.localeCompare(b.itemName));

    const servicePerformanceMap = new Map();
    for (const record of filteredServices) {
      for (const service of record.servicesDone || []) {
        const name = String(service || '').trim();
        if (!name) continue;
        servicePerformanceMap.set(name, (servicePerformanceMap.get(name) || 0) + 1);
      }
    }

    const popularServices = Array.from(servicePerformanceMap.entries())
      .map(([serviceName, count]) => ({ serviceName, count }))
      .sort((a, b) => b.count - a.count);

    const serviceTypeOptions = Array.from(
      new Set([...DEFAULT_SERVICE_TYPES, ...serviceTypeOptionsFromDb.filter(Boolean)])
    );

    return res.render('reports', {
      totalServices,
      totalVehicles,
      totalCustomers,
      totalRevenue,
      partsUsed: totalPartsUsed,
      serviceReports,
      vehicleReports,
      technicianReports,
      inventoryReports,
      popularServices,
      revenueSummary: {
        totalRevenue,
        serviceRevenue,
        partsRevenue,
        labourCharges
      },
      filters: {
        datePreset,
        serviceType,
        vehicleType,
        technicianId,
        customStartDate,
        customEndDate
      },
      options: {
        serviceTypeOptions,
        vehicleTypeOptions: [
          { value: 'small', label: 'Small Vehicle' },
          { value: 'commercial', label: 'Commercial Vehicle' },
          { value: 'heavy', label: 'Heavy Vehicle' }
        ],
        technicianOptions
      }
    });
  } catch (error) {
    console.error('Error loading reports page:', error);
    return res.status(500).send('Failed to load reports.');
  }
};

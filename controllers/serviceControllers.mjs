import User from "../models/User.mjs";
import ServiceRecord from "../models/ServiceRecord.mjs";
import Stock from "../models/Stock.mjs";
import Customers from "../models/Customers.mjs";
import Vehicle from "../models/Vehicle.mjs";

const LABOUR_CHARGE = 20000;

const SERVICE_PRICES = {
  "Wheel Alignment": 30000,
  "Wheel Balance": 20000,
};

const PRICE_RULES = [
  {
    label: "Engine Oil",
    keywords: ["engine oil"],
    min: 79000,
    max: 200000,
  },
  {
    label: "Brake Fluid",
    keywords: ["brake fluid"],
    min: 13000,
    max: 20000,
  },
  {
    label: "Oil Filter",
    keywords: ["oil filter"],
    min: 15000,
    max: 20000,
  },
];

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
};

const aggregateRequestedParts = (partIds, partQuantities) => {
  const ids = normalizeArray(partIds);
  const quantities = normalizeArray(partQuantities);
  const totalsByStockId = new Map();

  for (let i = 0; i < ids.length; i++) {
    const stockId = String(ids[i] || "").trim();
    const quantity = Number(quantities[i]);

    if (!stockId || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    totalsByStockId.set(
      stockId,
      (totalsByStockId.get(stockId) || 0) + quantity,
    );
  }

  return totalsByStockId;
};

const getPriceRule = (item) => {
  const haystack =
    `${item.itemName || ""} ${item.category || ""}`.toLowerCase();
  return PRICE_RULES.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword)),
  );
};

const parsePriceValue = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  return NaN;
};

const normalizeRulePrice = (price, rule) => {
  if (!Number.isFinite(price) || !rule) return price;
  if (price >= rule.min && price <= rule.max) return price;

  // Accept common data-entry typo where one trailing zero was omitted.
  const scaledByTen = price * 10;
  if (scaledByTen >= rule.min && scaledByTen <= rule.max) {
    return scaledByTen;
  }

  return price;
};

const validatePriceRule = (item) => {
  const rule = getPriceRule(item);
  if (!rule) return;

  const price = parsePriceValue(item.unitPrice ?? item.price);
  if (!Number.isFinite(price)) {
    throw new Error(`Missing unit price for ${item.itemName}`);
  }

  const normalizedPrice = normalizeRulePrice(price, rule);
  const boundedPrice = Math.max(rule.min, Math.min(rule.max, normalizedPrice));
  item.unitPrice = boundedPrice;
};

const buildPartsFromRequest = async (partIds, partQuantities) => {
  const requestedParts = aggregateRequestedParts(partIds, partQuantities);
  const partsArray = [];
  let partsCost = 0;

  for (const [stockId, quantity] of requestedParts.entries()) {
    const stockItem = await Stock.findById(stockId);
    if (!stockItem) {
      throw new Error(
        "A selected stock item no longer exists. Please refresh and try again.",
      );
    }

    validatePriceRule(stockItem);

    const unitPrice = Number(stockItem.unitPrice) || 0;
    partsCost += unitPrice * quantity;

    partsArray.push({
      stockId: stockItem._id,
      itemName: stockItem.itemName,
      quantity,
    });
  }

  return { partsArray, partsCost };
};

const calculateServiceCharges = (servicesDone) => {
  const servicesArray = normalizeArray(servicesDone).filter(Boolean);
  const serviceCharge = servicesArray.reduce((sum, serviceName) => {
    return sum + (SERVICE_PRICES[serviceName] || 0);
  }, 0);

  return {
    servicesArray,
    serviceCharge,
  };
};

const calculateTotalCost = ({ partsCost, serviceCharge }) => {
  return LABOUR_CHARGE + partsCost + serviceCharge;
};

const aggregatePartsByKey = (parts = []) => {
  const grouped = new Map();

  for (const part of parts) {
    const stockId = part?.stockId ? String(part.stockId) : "";
    const itemName = String(part?.itemName || "").trim();
    const quantity = Number(part?.quantity) || 0;

    if (quantity <= 0) continue;

    const key = stockId || `name:${itemName}`;
    if (!grouped.has(key)) {
      grouped.set(key, { stockId: stockId || null, itemName, quantity: 0 });
    }

    grouped.get(key).quantity += quantity;
  }

  return grouped;
};

const fetchStockByPartKey = async (part) => {
  if (part.stockId) {
    return Stock.findById(part.stockId);
  }

  if (part.itemName) {
    return Stock.findOne({ itemName: part.itemName });
  }

  return null;
};

const restorePartsToStock = async (parts = []) => {
  const grouped = aggregatePartsByKey(parts);

  for (const part of grouped.values()) {
    const stockItem = await fetchStockByPartKey(part);
    if (!stockItem) continue;

    await Stock.findByIdAndUpdate(stockItem._id, {
      $inc: { quantity: part.quantity },
    });
  }
};

const ensureAndDeductParts = async (
  parts = [],
  restoredParts = [],
  shouldDeduct = true,
) => {
  const requested = aggregatePartsByKey(parts);
  const restored = aggregatePartsByKey(restoredParts);

  for (const part of requested.values()) {
    const stockItem = await fetchStockByPartKey(part);
    if (!stockItem) {
      throw new Error(
        `Stock item not found for ${part.itemName || "selected part"}`,
      );
    }

    const restoredQty =
      restored.get(
        part.stockId ? String(part.stockId) : `name:${part.itemName}`,
      )?.quantity || 0;
    const availableAfterRestore =
      (Number(stockItem.quantity) || 0) + restoredQty;

    if (availableAfterRestore < part.quantity) {
      throw new Error(
        `Insufficient stock for ${stockItem.itemName}. Available ${availableAfterRestore}, requested ${part.quantity}.`,
      );
    }
  }

  if (!shouldDeduct) {
    return;
  }

  for (const part of requested.values()) {
    const stockItem = await fetchStockByPartKey(part);
    if (!stockItem) continue;

    await Stock.findByIdAndUpdate(stockItem._id, {
      $inc: { quantity: -part.quantity },
    });
  }
};

const getServiceFormData = async () => {
  const [technicians, customers, vehicles, availableStock] = await Promise.all([
    User.find({
      role: { $in: ["Technician", "Senior technician"] },
    }).lean(),

    Customers.find().sort({ firstName: 1, lastName: 1 }).lean(),

    Vehicle.find().sort({ registrationNo: 1 }).lean(),

    Stock.find({
      quantity: { $gt: 0 },
    }).lean(),
  ]);

  const stockByCategory = availableStock.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }

    acc[item.category].push(item);
    return acc;
  }, {});

  return {
    technicians,
    customers,
    vehicles,
    stockByCategory,
  };
};

export const getServiceForm = async (req, res) => {
  try {
    const { technicians, customers, vehicles, stockByCategory } =
      await getServiceFormData();

    return res.render("add-record", {
      technicians,
      customers,
      vehicles,
      stockByCategory,
      errorMessage: null,

      formData: {
        customer: "",
        vehicle: "",
        servicesDone: [],
        technicians: [],
      },
    });
  } catch (error) {
    console.error("Error loading form:", error);
    return res.status(500).send("Error loading form");
  }
};

export const createServiceRecord = async (req, res) => {
  try {
    const {
      customer,
      vehicle,
      servicesDone,
      technicians,
      partIds,
      partQuantities,
    } = req.body;
    const selectedCustomer = await Customers.findById(customer);

    if (!selectedCustomer) {
      throw new Error("Selected customer was not found.");
    }

    // Validate that vehicle belongs to selected customer
    const selectedVehicle = await Vehicle.findOne({
      _id: vehicle,
      customerId: customer,
    });

    if (!selectedVehicle) {
      throw new Error(
        "The selected vehicle does not belong to the selected customer.",
      );
    }

    if (req.serviceValidationErrors?.length) {
      const {
        technicians: availableTechnicians,
        customers,
        vehicles,
        stockByCategory,
      } = await getServiceFormData();

      return res.status(400).render("add-record", {
        technicians: availableTechnicians,
        customers,
        vehicles,
        stockByCategory,
        errorMessage: req.serviceValidationErrors.join(" "),
        formData: {
          customer: customer || "",
          vehicle: vehicle || "",
          servicesDone: normalizeArray(servicesDone).filter(Boolean),
          technicians: normalizeArray(technicians).filter(Boolean),
        },
      });
    }

    const { servicesArray, serviceCharge } =
      calculateServiceCharges(servicesDone);
    const techArray = normalizeArray(technicians).filter(Boolean);
    const { partsArray, partsCost } = await buildPartsFromRequest(
      partIds,
      partQuantities,
    );
    const totalCost = calculateTotalCost({ partsCost, serviceCharge });

    await ensureAndDeductParts(partsArray);

    //save the new service record
    const newRecord = new ServiceRecord({
      customer,
      vehicle,
      servicesDone: servicesArray,
      technicians: techArray,
      labourCharge: LABOUR_CHARGE,
      totalCost: Number(totalCost),
      partsUsed: partsArray,
    });
    await newRecord.save();
    res.redirect("/records");
  } catch (error) {
    console.error("Error creating a record", error);
    const {
      technicians: availableTechnicians,
      customers,
      vehicles,
      stockByCategory,
    } = await getServiceFormData();

    return res.status(500).render("add-record", {
      technicians: availableTechnicians,
      customers,
      vehicles,
      stockByCategory,
      errorMessage: error.message || "Error creating a record",
      formData: {
        customer: req.body?.customer || "",
        vehicle: req.body?.vehicle || "",
        servicesDone: normalizeArray(req.body?.servicesDone).filter(Boolean),
        technicians: normalizeArray(req.body?.technicians).filter(Boolean),
      },
    });
  }
};

// fetching data from the database
export const getAllRecords = async (req, res) => {
  try {
    const records = await ServiceRecord.find()
      .populate("customer", "firstName lastName phone email")
      .populate("vehicle", "registrationNo vehicleName vehicleType")
      .populate("technicians", "fullName")
      .sort({ date: -1 });

    return res.render("records", { records });
  } catch (error) {
    console.error("Error fetching records", error);
    res.status(500).send("Error fetching records");
  }
};

export const getEditRecordForm = async (req, res) => {
  try {
    const record = await ServiceRecord.findById(req.params.id)
      .populate('customer', 'firstName lastName phone email')
      .populate('vehicle', 'registrationNo vehicleName vehicleType');

    if (!record) {
      return res.status(404).send("Service Record not found");
    }
    const technicians = await User.find({
      role: { $in: ["Technician", "Senior technician"] },
    });
    const allStock = await Stock.find();
    const stockByCategory = allStock.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});
    res.render("editServiceRecord", {
      record,
      technicians,
      stockByCategory,
      errorMessage: null,
    });
  } catch (error) {
    console.error("Error loading editRecord form", error);
    res.status(500).send("Error loading editRecord form");
  }
};

export const updateServiceRecord = async (req, res) => {
  try {
    const record = await ServiceRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).send("Service Record not found");
    }
    const {
      customerName,
      carPlate,
      servicesDone,
      technicians,
      partIds,
      partQuantities,
    } = req.body;

    if (req.serviceValidationErrors?.length) {
      const techniciansList = await User.find({
        role: { $in: ["Technician", "Senior technician"] },
      });
      const allStock = await Stock.find();
      const stockByCategory = allStock.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
      }, {});

      record.customerName = customerName || record.customerName;
      record.carPlate = carPlate || record.carPlate;
      record.servicesDone = normalizeArray(servicesDone).filter(Boolean);
      record.technicians = normalizeArray(technicians).filter(Boolean);

      return res.status(400).render("editServiceRecord", {
        record,
        technicians: techniciansList,
        stockByCategory,
        errorMessage: req.serviceValidationErrors.join(" "),
      });
    }

    const { servicesArray, serviceCharge } =
      calculateServiceCharges(servicesDone);
    const techArray = normalizeArray(technicians).filter(Boolean);
    const { partsArray, partsCost } = await buildPartsFromRequest(
      partIds,
      partQuantities,
    );
    const totalCost = calculateTotalCost({ partsCost, serviceCharge });

    await ensureAndDeductParts(partsArray, record.partsUsed, false);
    await restorePartsToStock(record.partsUsed);
    await ensureAndDeductParts(partsArray);

    //update the service record in the database.
    await ServiceRecord.findByIdAndUpdate(req.params.id, {
      customerName,
      carPlate,
      servicesDone: servicesArray,
      technicians: techArray,
      labourCharge: LABOUR_CHARGE,
      totalCost,
      partsUsed: partsArray,
    });

    res.redirect("/records");
  } catch (error) {
    console.error("Error updating a record", error);
    const record = await ServiceRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).send("Service Record not found");
    }

    const technicians = await User.find({
      role: { $in: ["Technician", "Senior technician"] },
    });
    const allStock = await Stock.find();
    const stockByCategory = allStock.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    record.customerName = req.body?.customerName || record.customerName;
    record.carPlate = req.body?.carPlate || record.carPlate;
    record.servicesDone = normalizeArray(req.body?.servicesDone).filter(
      Boolean,
    );
    record.technicians = normalizeArray(req.body?.technicians).filter(Boolean);

    return res.status(400).render("editServiceRecord", {
      record,
      technicians,
      stockByCategory,
      errorMessage: error.message || "Error updating a record",
    });
  }
};

export const deleteServiceRecord = async (req, res) => {
  try {
    const record = await ServiceRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).send("Service Record not found");
    }

    await restorePartsToStock(record.partsUsed);
    await ServiceRecord.findByIdAndDelete(req.params.id);
    res.redirect("/records");
  } catch (error) {
    console.error("Error deleting a record", error);
    res.status(500).send("Error deleting a record");
  }
};

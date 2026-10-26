import Vehicle from '../models/Vehicle.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import Customers from '../models/Customers.mjs';
import { dashboardPermissionsByRole } from './dashboardControllers.mjs';
import { setFlash } from '../utils/flash.mjs';
import { audit } from '../services/auditService.mjs';
import { isServiceDue, nextServiceDate } from '../services/vehicleService.mjs';
import { whyVehicleCannotBeDeleted } from '../services/deletionGuards.mjs';

const getRolePermissions = (role) => {
  return dashboardPermissionsByRole[role] || dashboardPermissionsByRole.Technician;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (dateValue) => {
  if (!dateValue) {
    return 'N/A';
  }

  return new Date(dateValue).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const normalizePlate = (plate) => String(plate || '').trim().toUpperCase();

const toObjectIdString = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const getCustomerDisplayName = (customer) => {
  const firstName = String(customer?.firstName || '').trim();
  const lastName = String(customer?.lastName || '').trim();
  return `${firstName} ${lastName}`.trim();
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveCustomerForVehicle = async ({ customerId, ownerName }) => {
  const normalizedOwnerName = String(ownerName || '').trim();
  const normalizedCustomerId = toObjectIdString(customerId);

  if (normalizedCustomerId) {
    const selectedCustomer = await Customers.findById(normalizedCustomerId).lean();
    if (selectedCustomer) {
      return {
        customerId: selectedCustomer._id,
        ownerName: getCustomerDisplayName(selectedCustomer) || normalizedOwnerName,
      };
    }
  }

  if (!normalizedOwnerName) {
    return {
      customerId: null,
      ownerName: '',
    };
  }

  const ownerNameRegex = new RegExp(`^${escapeRegExp(normalizedOwnerName)}$`, 'i');
  const matchedCustomer = await Customers.findOne({
    $expr: {
      $regexMatch: {
        input: {
          $trim: {
            input: { $concat: ['$firstName', ' ', '$lastName'] },
          },
        },
        regex: ownerNameRegex.source,
        options: 'i',
      },
    },
  }).lean();

  return {
    customerId: matchedCustomer?._id || null,
    ownerName: normalizedOwnerName,
  };
};

const vehicleTypeLabel = {
  small: 'Small Vehicle',
  commercial: 'Commercial',
  heavy: 'Heavy Vehicle',
};

const typeClass = {
  small: 'small',
  commercial: 'commercial',
  heavy: 'heavy',
};

const statusClass = {
  Active: 'active',
  'Service Due': 'service',
};

export const getVehiclePage = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [vehicles, servicedToday, serviceCountByPlate] = await Promise.all([
      Vehicle.find().sort({ createdAt: -1 }).lean(),
      ServiceRecord.countDocuments({
        date: { $gte: todayStart, $lt: tomorrowStart },
      }),
      ServiceRecord.aggregate([
        {
          $group: {
            _id: '$vehicle',
            serviceVisits: { $sum: 1 },
          },
        },
        { $sort: { serviceVisits: -1 } },
        { $limit: 3 },
      ]),
    ]);

    const totalVehicles = vehicles.length;
    const smallVehicles = vehicles.filter((vehicle) => vehicle.vehicleType === 'small').length;
    const commercialVehicles = vehicles.filter((vehicle) => vehicle.vehicleType === 'commercial').length;
    const heavyVehicles = vehicles.filter((vehicle) => vehicle.vehicleType === 'heavy').length;

    const dashboardStats = {
      totalVehicles,
      servicedToday,
      smallVehicles,
      commercialHeavyVehicles: commercialVehicles + heavyVehicles,
      commercialVehicles,
      heavyVehicles,
    };

    // "Service Due" is worked out from the last service date, not typed in by hand
    const withDue = vehicles.map((vehicle) => ({ ...vehicle, status: isServiceDue(vehicle) ? 'Service Due' : 'Active' }));

    const vehicleRecords = withDue.map((vehicle) => ({
      ...vehicle,
      nextServiceDisplay: formatDate(nextServiceDate(vehicle)),
      color: vehicle.color || 'N/A',
      vehicleTypeLabel: vehicleTypeLabel[vehicle.vehicleType] || 'Small Vehicle',
      typeClass: typeClass[vehicle.vehicleType] || 'small',
      statusClass: statusClass[vehicle.status] || 'active',
      lastServiceDisplay: formatDate(vehicle.lastService),
      iconClass: vehicle.vehicleType === 'small' ? 'fa-car' : 'fa-truck',
    }));

    const vehiclesById = new Map(vehicles.map((vehicle) => [String(vehicle._id), vehicle]));

    const popularVehicles = serviceCountByPlate.map((entry, index) => {
      const vehicle = vehiclesById.get(String(entry._id));

      return {
        rank: index + 1,
        name: vehicle ? `${vehicle.vehicleName} (${vehicle.registrationNo})` : 'Unknown Vehicle',
        iconClass: vehicle?.vehicleType === 'small' ? 'fa-car' : 'fa-truck',
        serviceVisits: toNumber(entry.serviceVisits),
      };
    });

    const role = req.session?.userRole;
    const permissions = getRolePermissions(role);

    return res.render('vehicles', {
      dashboardStats,
      vehicleRecords,
      popularVehicles,
      permissions,
    });
  } catch (error) {
    console.error('Error loading vehicle page:', error);
    return res.status(500).send('Error loading vehicles page');
  }
};

export const getRegisterVehiclePage = (req, res) => {
  return Customers.find().sort({ firstName: 1, lastName: 1 }).lean().then((customers) => {
    const role = req.session?.userRole;
    const permissions = getRolePermissions(role);

    return res.render('registerVehicle', {
      permissions,
      customers,
      formData: {
        customerId: '',
        vehicleName: '',
        color: '',
        registrationNo: '',
        ownerName: '',
        vehicleType: 'small',
        status: 'Active',
        lastService: '',
      },
      errorMessage: null,
    });
  }).catch((error) => {
    console.error('Error loading register vehicle page:', error);
    return res.status(500).send('Error loading register vehicle page');
  });
};

export const createVehicle = async (req, res) => {
  try {
    const {
      customerId,
      vehicleName,
      color,
      registrationNo,
      ownerName,
      vehicleType,
      status,
      lastService,
    } = req.body;

    const linkedCustomer = await resolveCustomerForVehicle({ customerId, ownerName });

    const payload = {
      customerId: linkedCustomer.customerId,
      vehicleName: (vehicleName || '').trim(),
      color: (color || '').trim(),
      registrationNo: normalizePlate(registrationNo),
      ownerName: linkedCustomer.ownerName,
      vehicleType,
      status,
      lastService: lastService ? new Date(lastService) : null,
    };

    if (req.vehicleValidationErrors?.length) {
      const permissions = getRolePermissions(req.session?.userRole);
      const customers = await Customers.find().sort({ firstName: 1, lastName: 1 }).lean();
      return res.status(400).render('registerVehicle', {
        permissions,
        customers,
        formData: {
          customerId: customerId || '',
          vehicleName: payload.vehicleName,
          color: payload.color,
          registrationNo: payload.registrationNo,
          ownerName: payload.ownerName,
          vehicleType: payload.vehicleType || 'small',
          status: payload.status || 'Active',
          lastService: lastService || '',
        },
        errorMessage: req.vehicleValidationErrors.join(' '),
      });
    }

    if (!payload.vehicleName || !payload.registrationNo || !payload.ownerName) {
      const permissions = getRolePermissions(req.session?.userRole);
      const customers = await Customers.find().sort({ firstName: 1, lastName: 1 }).lean();
      return res.status(400).render('registerVehicle', {
        permissions,
        customers,
        formData: {
          customerId: customerId || '',
          vehicleName: payload.vehicleName,
          color: payload.color,
          registrationNo: payload.registrationNo,
          ownerName: payload.ownerName,
          vehicleType: payload.vehicleType || 'small',
          status: payload.status || 'Active',
          lastService: lastService || '',
        },
        errorMessage: 'Vehicle name, registration number and owner name are required.',
      });
    }

    const vehicle = new Vehicle(payload);
    await vehicle.save();
    setFlash(req, `Vehicle "${vehicle.registrationNo}" registered successfully.`);
    return res.redirect('/vehicles');
  } catch (error) {
    const permissions = getRolePermissions(req.session?.userRole);
    const customers = await Customers.find().sort({ firstName: 1, lastName: 1 }).lean();
    const duplicateEntry = error?.code === 11000;

    return res.status(400).render('registerVehicle', {
      permissions,
      customers,
      formData: {
        customerId: req.body?.customerId || '',
        vehicleName: req.body?.vehicleName || '',
        color: req.body?.color || '',
        registrationNo: req.body?.registrationNo || '',
        ownerName: req.body?.ownerName || '',
        vehicleType: req.body?.vehicleType || 'small',
        status: req.body?.status || 'Active',
        lastService: req.body?.lastService || '',
      },
      errorMessage: duplicateEntry
        ? 'A vehicle with that registration number already exists.'
        : `Failed to register vehicle: ${error.message}`,
    });
  }
};

export const getEditVehiclePage = async (req, res) => {
  try {
    const [vehicle, customers] = await Promise.all([
      Vehicle.findById(req.params.id).lean(),
      Customers.find().sort({ firstName: 1, lastName: 1 }).lean(),
    ]);

    if (!vehicle) {
      return res.status(404).send('Vehicle not found');
    }

    const role = req.session?.userRole;
    const permissions = getRolePermissions(role);

    return res.render('editVehicle', {
      permissions,
      customers,
      vehicle: {
        ...vehicle,
        lastServiceInput: vehicle.lastService
          ? new Date(vehicle.lastService).toISOString().split('T')[0]
          : '',
      },
      errorMessage: null,
    });
  } catch (error) {
    console.error('Error loading vehicle edit page:', error);
    return res.status(500).send('Error loading vehicle edit page');
  }
};

export const updateVehicle = async (req, res) => {
  try {
    const {
      customerId,
      vehicleName,
      color,
      registrationNo,
      ownerName,
      vehicleType,
      status,
      lastService,
    } = req.body;

    const linkedCustomer = await resolveCustomerForVehicle({ customerId, ownerName });

    if (req.vehicleValidationErrors?.length) {
      const role = req.session?.userRole;
      const permissions = getRolePermissions(role);
      const [existing, customers] = await Promise.all([
        Vehicle.findById(req.params.id).lean(),
        Customers.find().sort({ firstName: 1, lastName: 1 }).lean(),
      ]);

      return res.status(400).render('editVehicle', {
        permissions,
        customers,
        vehicle: {
          ...(existing || {}),
          ...req.body,
          customerId: customerId || existing?.customerId || '',
          _id: req.params.id,
          lastServiceInput: req.body?.lastService || '',
        },
        errorMessage: req.vehicleValidationErrors.join(' '),
      });
    }

    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      {
        customerId: linkedCustomer.customerId,
        vehicleName: (vehicleName || '').trim(),
        color: (color || '').trim(),
        registrationNo: normalizePlate(registrationNo),
        ownerName: linkedCustomer.ownerName,
        vehicleType,
        status,
        lastService: lastService ? new Date(lastService) : null,
      },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedVehicle) {
      return res.status(404).send('Vehicle not found');
    }

    setFlash(req, `Vehicle "${updatedVehicle.registrationNo}" updated successfully.`);
    return res.redirect('/vehicles');
  } catch (error) {
    const role = req.session?.userRole;
    const permissions = getRolePermissions(role);
    const [existing, customers] = await Promise.all([
      Vehicle.findById(req.params.id).lean(),
      Customers.find().sort({ firstName: 1, lastName: 1 }).lean(),
    ]);
    const duplicateEntry = error?.code === 11000;

    return res.status(400).render('editVehicle', {
      permissions,
      customers,
      vehicle: {
        ...(existing || {}),
        ...req.body,
        _id: req.params.id,
        lastServiceInput: req.body?.lastService || '',
      },
      errorMessage: duplicateEntry
        ? 'A vehicle with that registration number already exists.'
        : `Failed to update vehicle: ${error.message}`,
    });
  }
};

export const deleteVehicle = async (req, res) => {
  try {
    const blocker = await whyVehicleCannotBeDeleted(req.params.id);
    if (blocker) {
      setFlash(req, blocker, 'danger');
      return res.redirect('/vehicles');
    }
    const removed = await Vehicle.findByIdAndDelete(req.params.id);
    await audit(req, { action: 'deleted', entity: 'Vehicle', entityId: req.params.id, summary: `Deleted vehicle ${removed ? removed.registrationNo : 'unknown'}.` });
    setFlash(req, 'Vehicle deleted.');
    return res.redirect('/vehicles');
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    return res.status(500).send('Error deleting vehicle');
  }
};

export const getVehicleDetail = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).lean();
    if (!vehicle) {
      return res.status(404).send('Vehicle not found');
    }

    const [customer, services] = await Promise.all([
      vehicle.customerId ? Customers.findById(vehicle.customerId).lean() : null,
      ServiceRecord.find({ vehicle: vehicle._id })
        .populate('customer', 'firstName lastName')
        .populate('technicians', 'fullName')
        .sort({ date: -1 })
        .lean(),
    ]);

    const permissions = getRolePermissions(req.session?.userRole);

    return res.render('vehicleDetail', {
      vehicle: {
        ...vehicle,
        vehicleTypeLabel: vehicleTypeLabel[vehicle.vehicleType] || 'Small Vehicle',
        lastServiceDisplay: formatDate(vehicle.lastService),
      },
      customer,
      services,
      permissions,
    });
  } catch (error) {
    console.error('Error loading vehicle detail:', error);
    return res.status(500).send('Error loading vehicle detail');
  }
};

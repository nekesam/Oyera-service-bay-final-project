import ServiceRecord from '../models/ServiceRecord.mjs';
import User from '../models/User.mjs';
import { dashboardPermissionsByRole } from './dashboardControllers.mjs';
import { setFlash } from '../utils/flash.mjs';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toId = (value) => String(value);

const getRolePermissions = (role) => {
  return dashboardPermissionsByRole[role] || dashboardPermissionsByRole.Technician;
};

const getInitials = (fullName) => {
  if (!fullName) {
    return '--';
  }

  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
};

  const technicianRoles = ['Technician', 'Senior technician'];

export const getTechnicianPage = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const nextMonthStart = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);

    const [technicians, jobsTodayByTech, topPerformersAggregation, skillsAggregation] = await Promise.all([
      User.find({ role: { $in: technicianRoles } })
        .sort({ fullName: 1 })
        .lean(),
      ServiceRecord.aggregate([
        {
          $match: {
            date: { $gte: todayStart, $lt: tomorrowStart },
          },
        },
        { $unwind: '$technicians' },
        { $group: { _id: '$technicians', jobsToday: { $sum: 1 } } },
      ]),
      ServiceRecord.aggregate([
        {
          $match: {
            date: { $gte: monthStart, $lt: nextMonthStart },
          },
        },
        { $unwind: '$technicians' },
        { $group: { _id: '$technicians', jobsCompleted: { $sum: 1 } } },
        { $sort: { jobsCompleted: -1 } },
        { $limit: 3 },
      ]),
      ServiceRecord.aggregate([
        { $unwind: { path: '$servicesDone', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$servicesDone', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const jobsByTechId = new Map(
      jobsTodayByTech.map((row) => [toId(row._id), toNumber(row.jobsToday)])
    );

    const technicianRecords = technicians.map((technician) => {
      const jobsToday = jobsByTechId.get(toId(technician._id)) || 0;
      const status = jobsToday > 0 ? 'Busy' : 'Available';

      return {
        ...technician,
        initials: getInitials(technician.fullName),
        specialization: technician.role,
        experience: 'N/A',
        status,
        jobsToday,
        phone: technician.phone || 'Not provided',
      };
    });

    const totalTechnicians = technicianRecords.length;
    const busyToday = technicianRecords.filter((item) => item.jobsToday > 0).length;
    const availableToday = technicianRecords.filter((item) => item.jobsToday === 0).length;
    const onLeave = 0;
    const presentToday = busyToday + availableToday;
    const absentToday = Math.max(totalTechnicians - presentToday, 0);

    const dashboardStats = {
      totalTechnicians,
      presentToday,
      onLeave,
      absentToday,
      availableToday,
      busyToday,
    };

    const techniciansById = new Map(
      technicians.map((technician) => [toId(technician._id), technician])
    );

    const topPerformers = topPerformersAggregation
      .map((row) => {
        const technician = techniciansById.get(toId(row._id));
        if (!technician) {
          return null;
        }

        return {
          fullName: technician.fullName,
          initials: getInitials(technician.fullName),
          jobsCompleted: toNumber(row.jobsCompleted),
        };
      })
      .filter(Boolean);

    const totalSkillCount = skillsAggregation.reduce((total, row) => total + toNumber(row.count), 0);
    const skillsOverview = skillsAggregation.map((row) => {
      const count = toNumber(row.count);
      const percentage = totalSkillCount ? Math.round((count / totalSkillCount) * 100) : 0;

      return {
        name: row._id,
        count,
        percentage,
      };
    });

    const role = req.session?.userRole;
    const permissions = getRolePermissions(role);

    return res.render('technicians', {
      dashboardStats,
      technicianRecords,
      skillsOverview,
      topPerformers,
      permissions,
    });
  } catch (error) {
    console.error('Error loading technician page:', error);
    return res.status(500).send('Error loading technician page');
  }
};

export const getTechnicianRegisterPage = (req, res) => {
  const role = req.session?.userRole;
  const permissions = getRolePermissions(role);

  return res.render('registerTechnician', {
    permissions,
    formData: {
      fullName: '',
      identifier: '',
      role: 'Technician',
    },
    errorMessage: null,
  });
};

export const registerTechnician = async (req, res) => {
  try {
    const { fullName, identifier, password } = req.body;
    let { role } = req.body;

    const cleanName = (fullName || '').trim();
    const cleanIdentifier = (identifier || '').trim();
    const cleanPassword = (password || '').trim();

    const allowedRoles = ['Technician', 'Senior technician'];
    if (!allowedRoles.includes(role)) {
      role = 'Technician';
    }

    if (req.technicianValidationErrors?.length) {
      const permissions = getRolePermissions(req.session?.userRole);
      return res.status(400).render('registerTechnician', {
        permissions,
        formData: {
          fullName: cleanName,
          identifier: cleanIdentifier,
          role,
        },
        errorMessage: req.technicianValidationErrors.join(' '),
      });
    }

    if (!cleanName || !cleanIdentifier || !cleanPassword) {
      const permissions = getRolePermissions(req.session?.userRole);
      return res.status(400).render('registerTechnician', {
        permissions,
        formData: {
          fullName: cleanName,
          identifier: cleanIdentifier,
          role,
        },
        errorMessage: 'Full name, identifier and password are required.',
      });
    }

    const isEmail = cleanIdentifier.includes('@');
    const userData = {
      fullName: cleanName,
      role,
      password: cleanPassword,
    };

    if (isEmail) {
      userData.email = cleanIdentifier;
    } else {
      userData.phone = cleanIdentifier;
    }

    const newUser = new User(userData);
    await newUser.save();

    setFlash(req, `Technician "${newUser.fullName}" registered successfully.`);
    return res.redirect('/technicians');
  } catch (error) {
    const duplicateEntry = error?.code === 11000;
    const permissions = getRolePermissions(req.session?.userRole);

    return res.status(400).render('registerTechnician', {
      permissions,
      formData: {
        fullName: req.body?.fullName || '',
        identifier: req.body?.identifier || '',
        role: req.body?.role || 'Technician',
      },
      errorMessage: duplicateEntry
        ? 'A user with that phone or email already exists.'
        : `Failed to register technician: ${error.message}`,
    });
  }
};

export const getEditTechnicianForm = async (req, res) => {
  try {
    const technician = await User.findOne({
      _id: req.params.id,
      role: { $in: technicianRoles },
    }).lean();

    if (!technician) {
      return res.status(404).send('Technician not found');
    }

    const role = req.session?.userRole;
    const permissions = getRolePermissions(role);

    return res.render('editTechnician', {
      permissions,
      technician,
      errorMessage: null,
    });
  } catch (error) {
    console.error('Error loading technician edit form:', error);
    return res.status(500).send('Error loading technician edit form');
  }
};

export const updateTechnician = async (req, res) => {
  try {
    const { fullName, email, phone } = req.body;
    let { role } = req.body;

    const cleanName = (fullName || '').trim();
    const cleanEmail = (email || '').trim();
    const cleanPhone = (phone || '').trim();

    if (!technicianRoles.includes(role)) {
      role = 'Technician';
    }

    if (req.technicianUpdateValidationErrors?.length) {
      const existingTechnician = await User.findById(req.params.id).lean();
      const permissions = getRolePermissions(req.session?.userRole);

      return res.status(400).render('editTechnician', {
        permissions,
        technician: {
          ...existingTechnician,
          fullName: cleanName,
          role,
          email: cleanEmail,
          phone: cleanPhone,
        },
        errorMessage: req.technicianUpdateValidationErrors.join(' '),
      });
    }

    if (!cleanName) {
      const existingTechnician = await User.findById(req.params.id).lean();
      const permissions = getRolePermissions(req.session?.userRole);

      return res.status(400).render('editTechnician', {
        permissions,
        technician: {
          ...existingTechnician,
          fullName: cleanName,
          role,
          email: cleanEmail,
          phone: cleanPhone,
        },
        errorMessage: 'Full name is required.',
      });
    }

    const updated = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: technicianRoles } },
      {
        fullName: cleanName,
        role,
        email: cleanEmail || undefined,
        phone: cleanPhone || undefined,
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).send('Technician not found');
    }

    setFlash(req, `Technician "${updated.fullName}" updated successfully.`);
    return res.redirect('/technicians');
  } catch (error) {
    const existingTechnician = await User.findById(req.params.id).lean();
    const permissions = getRolePermissions(req.session?.userRole);
    const duplicateEntry = error?.code === 11000;

    return res.status(400).render('editTechnician', {
      permissions,
      technician: {
        ...existingTechnician,
        fullName: req.body?.fullName || '',
        role: req.body?.role || 'Technician',
        email: req.body?.email || '',
        phone: req.body?.phone || '',
      },
      errorMessage: duplicateEntry
        ? 'Email or phone is already in use.'
        : `Failed to update technician: ${error.message}`,
    });
  }
};

export const deleteTechnician = async (req, res) => {
  try {
    await User.findOneAndDelete({
      _id: req.params.id,
      role: { $in: technicianRoles },
    });

    setFlash(req, 'Technician deleted.');
    return res.redirect('/technicians');
  } catch (error) {
    console.error('Error deleting technician:', error);
    return res.status(500).send('Error deleting technician');
  }
};

export const getTechnicianDetail = async (req, res) => {
  try {
    const technician = await User.findOne({
      _id: req.params.id,
      role: { $in: technicianRoles },
    }).lean();

    if (!technician) {
      return res.status(404).send('Technician not found');
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const services = await ServiceRecord.find({ technicians: technician._id })
      .populate('customer', 'firstName lastName')
      .populate('vehicle', 'registrationNo')
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const jobsThisMonth = services.filter((service) => new Date(service.date) >= monthStart).length;

    const permissions = getRolePermissions(req.session?.userRole);

    return res.render('technicianDetail', {
      technician: {
        ...technician,
        initials: getInitials(technician.fullName),
      },
      services,
      stats: {
        totalJobs: services.length,
        jobsThisMonth,
      },
      permissions,
    });
  } catch (error) {
    console.error('Error loading technician detail:', error);
    return res.status(500).send('Error loading technician detail');
  }
};

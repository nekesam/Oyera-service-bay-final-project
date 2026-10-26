import AuditLog from '../models/AuditLog.mjs';
import { paginate } from '../utils/paginate.mjs';

const ENTITIES = ['ServiceRecord', 'Stock', 'Customers', 'Vehicle', 'User'];

export const getAuditLog = async (req, res) => {
  const entity = ENTITIES.includes(req.query.entity) ? req.query.entity : '';
  const filter = entity ? { entity } : {};

  const total = await AuditLog.countDocuments(filter);
  const pagination = paginate(req.query, total, 25);
  const entries = await AuditLog.find(filter).sort({ at: -1 }).skip(pagination.skip).limit(pagination.pageSize).lean();

  return res.render('audit', { pageTitle: 'Audit log', entries, pagination, entity, entities: ENTITIES });
};

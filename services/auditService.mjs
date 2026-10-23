import AuditLog from '../models/AuditLog.mjs';

// Writes one line to the audit trail. It must NEVER break the action being audited:
// if the log can't be written, we report it and carry on.
export const audit = async (req, { action, entity, entityId, summary }) => {
  try {
    await AuditLog.create({
      actor: req.session?.userId,
      actorName: req.session?.userName || 'System',
      actorRole: req.session?.userRole,
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      summary,
    });
  } catch (error) {
    console.error('Could not write audit log:', error.message);
  }
};

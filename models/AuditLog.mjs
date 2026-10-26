import mongoose from 'mongoose';

// A permanent "who did what, when" trail for sensitive changes.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, default: 'System' },
    actorRole: { type: String },
    action: { type: String, required: true }, // e.g. "created", "updated", "deleted", "payment", "status"
    entity: { type: String, required: true }, // e.g. "ServiceRecord", "Stock"
    entityId: { type: String },
    summary: { type: String, required: true }, // plain-English sentence
  },
  { timestamps: { createdAt: 'at', updatedAt: false } },
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ entity: 1, at: -1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;

import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, trim: true, maxlength: 100 },
  resource: { type: String, required: true, trim: true, maxlength: 100, index: true },
  resourceId: { type: String, trim: true, maxlength: 100 },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, trim: true, maxlength: 100 },
}, { collection: 'auditLogs', timestamps: true });

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

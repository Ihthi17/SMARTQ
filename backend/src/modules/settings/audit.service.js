import { AuditLog } from './auditLog.model.js';
import { Setting } from './setting.model.js';

export const writeAuditLog = async (request, { action, resource, resourceId, details = {} }) => {
  if ((await Setting.get('audit_enabled', true)) !== true) return;
  if (resource === 'appointment' && (await Setting.get('audit_appointment_changes', true)) !== true) return;
  try {
    await AuditLog.create({
      actorId: request.user?.userId,
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : undefined,
      details,
      ipAddress: request.ip,
    });
  } catch (error) {
    console.error(`Could not record audit event ${action} on ${resource}:`, error);
  }
};

export const removeExpiredAuditLogs = async () => {
  const retentionDays = Math.max(1, Number(await Setting.get('audit_retention_days', 365)) || 365);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  return AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
};

let retentionScheduler;

export const startAuditRetentionScheduler = () => {
  if (retentionScheduler) return retentionScheduler;
  retentionScheduler = setInterval(async () => {
    try {
      await removeExpiredAuditLogs();
    } catch (error) {
      console.error('Audit log retention cleanup failed:', error);
    }
  }, 60 * 60 * 1000);
  retentionScheduler.unref();
  return retentionScheduler;
};

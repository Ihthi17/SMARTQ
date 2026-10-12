import { Appointment } from '../appointments/appointment.model.js';
import { Setting } from '../settings/setting.model.js';
import { AuditLog } from '../settings/auditLog.model.js';
import { processRecurringSeries } from '../appointments/recurring.service.js';
import { cleanupExpiredWaitingList } from '../appointments/waiting-list.service.js';
import { processAutoRecalls } from '../appointments/queue-recall.service.js';

let timer;
let processing = false;

export const processAppointmentMaintenance = async () => {
  // Auto-cancellation: mark pending appointments as no-show after grace period
  const autoCancel = await Setting.get('appointment_auto_cancel', true);
  if (autoCancel === true) {
    const graceMinutes = Math.max(0, Number(await Setting.get('appointment_no_show_grace_minutes', 15)) || 0);
    const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);
    const result = await Appointment.updateMany(
      { status: 'pending', scheduledStart: { $lt: cutoff } },
      { $set: { status: 'no_show', cancellationReason: 'Automatically marked no-show after the grace period.' } },
    );
    if (result.modifiedCount > 0 && (await Setting.get('audit_enabled', true)) === true) {
      await AuditLog.create({
        action: 'appointment.no_show_automation',
        resource: 'appointment',
        details: { count: result.modifiedCount },
      });
    }
  }

  if ((await Setting.get('appointment_delete_finished', false)) === true) {
    const days = Math.max(1, Number(await Setting.get('appointment_delete_finished_after_days', 1)) || 1);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await Appointment.deleteMany({
      status: { $in: ['completed', 'cancelled', 'no_show'] },
      updatedAt: { $lt: cutoff },
    });
  }

  // Process recurring appointments
  if ((await Setting.get('appointment_recurring', false)) === true) {
    try {
      await processRecurringSeries();
    } catch (error) {
      console.error('Recurring series processing failed:', error);
    }
  }

  // Cleanup expired waiting list entries
  if ((await Setting.get('appointment_waiting_list', true)) === true) {
    try {
      await cleanupExpiredWaitingList();
    } catch (error) {
      console.error('Waiting list cleanup failed:', error);
    }
  }

  // Process auto-recalls for called customers
  if ((await Setting.get('queue_recall_enabled', true)) === true) {
    try {
      await processAutoRecalls();
    } catch (error) {
      console.error('Auto-recall processing failed:', error);
    }
  }
};

export const startNotificationScheduler = () => {
  if (timer) return timer;
  timer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      await processAppointmentMaintenance();
    } catch (error) {
      console.error('Appointment maintenance scheduler failed:', error);
    } finally {
      processing = false;
    }
  }, 60 * 1000);
  timer.unref();
  return timer;
};

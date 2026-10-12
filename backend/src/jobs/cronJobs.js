import cron from 'node-cron';
import { Appointment } from '../modules/appointments/appointment.model.js';
import { Setting } from '../modules/settings/setting.model.js';
import { QueueSession } from '../modules/queue/queueSession.model.js';
import { Counter } from '../modules/appointments/counter.model.js';

/**
 * Auto-delete completed appointments after specified days
 */
const registerAutoDeleteAppointments = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      const autoDeletEnabled = await Setting.get('appointment_delete_finished', false);
      if (autoDeletEnabled !== true) return;

      const deleteAfterDays = Number(await Setting.get('appointment_delete_finished_after_days', 1)) || 1;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - deleteAfterDays);

      const result = await Appointment.deleteMany({
        status: 'completed',
        updatedAt: { $lt: cutoffDate },
      });

      if (result.deletedCount > 0) {
        console.log(`[Cron] Auto-deleted ${result.deletedCount} completed appointments older than ${deleteAfterDays} days`);
      }
    } catch (error) {
      console.error('[Cron] Error in auto-delete appointments job:', error);
    }
  });
};

/**
 * Handle no-show appointments (checkInExpiresAt passed, still confirmed)
 * Status: confirmed -> no_show (every 5 minutes)
 */
const registerHandleNoShowAppointments = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const result = await Appointment.updateMany(
        {
          status: 'confirmed',
          checkInExpiresAt: { $lt: now },
        },
        {
          $set: {
            status: 'no_show',
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`[Cron] Updated ${result.modifiedCount} appointments to no_show (check-in window expired)`);
      }
    } catch (error) {
      console.error('[Cron] Error in handle no-show appointments job:', error);
    }
  });
};

/**
 * Handle expired pending appointments (startTime passed, still pending)
 * Status: pending -> expired (every 5 minutes)
 */
const registerHandleExpiredAppointments = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const result = await Appointment.updateMany(
        {
          status: 'pending',
          scheduledStart: { $lt: now },
          // Walk-in / flexible services have no real scheduled time (scheduledStart is a
          // placeholder), so they must never auto-expire based on the clock.
          hasScheduledTime: { $ne: false },
        },
        {
          $set: {
            status: 'expired',
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`[Cron] Updated ${result.modifiedCount} appointments to expired (scheduled start time passed)`);
      }
    } catch (error) {
      console.error('[Cron] Error in handle expired appointments job:', error);
    }
  });
};

/**
 * Clean up old queue sessions
 */
const registerCleanupQueueSessions = () => {
  cron.schedule('0 3 * * *', async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days of history

      const result = await QueueSession.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      if (result.deletedCount > 0) {
        console.log(`[Cron] Cleaned up ${result.deletedCount} old queue sessions`);
      }
    } catch (error) {
      console.error('[Cron] Error in cleanup queue sessions job:', error);
    }
  });
};

/**
 * Reset queue numbers based on configured frequency and time
 * Supports: daily, weekly (Monday), monthly (1st), never
 */
const registerQueueNumberReset = () => {
  // Run every minute to check if reset should happen
  cron.schedule('* * * * *', async () => {
    try {
      const resetFrequency = await Setting.get('queue_number_reset', 'daily');
      if (resetFrequency === 'never') return; // Skip if never reset

      const resetTimeStr = await Setting.get('queue_number_reset_time', '00:00');
      const [resetHour, resetMinute] = resetTimeStr.split(':').map(Number);

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Check if current time matches reset time (within a minute)
      const isResetTime = currentHour === resetHour && currentMinute === resetMinute;
      if (!isResetTime) return;

      // Check if reset should happen based on frequency
      let shouldReset = false;

      if (resetFrequency === 'daily') {
        shouldReset = true;
      } else if (resetFrequency === 'weekly') {
        // Reset on Monday (day 1, where Sunday is 0)
        shouldReset = now.getDay() === 1;
      } else if (resetFrequency === 'monthly') {
        // Reset on 1st of month
        shouldReset = now.getDate() === 1;
      }

      if (!shouldReset) return;

      // Get today's date at start of day
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Reset all counters for today
      // The Counter model uses locationId as key, but we want to reset by provider
      // Get all active providers and reset their counters
      const result = await Counter.deleteMany({
        date: today,
      });

      if (result.deletedCount > 0) {
        console.log(`[Cron] Queue number reset triggered (${resetFrequency}). Reset ${result.deletedCount} counters.`);
      }
    } catch (error) {
      console.error('[Cron] Error in queue number reset job:', error);
    }
  });
};

export const registerCronJobs = () => {
  try {
    registerAutoDeleteAppointments();
    registerCleanupQueueSessions();
    registerHandleNoShowAppointments();
    registerHandleExpiredAppointments();
    registerQueueNumberReset();
    console.log('[Cron] All scheduled jobs registered successfully');
  } catch (error) {
    console.error('[Cron] Failed to register cron jobs:', error);
  }
};

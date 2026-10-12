/**
 * One-time fix: restore walk-in appointments that were wrongly auto-expired.
 *
 * Before the cron fix, the expiry job marked walk-in appointments (hasScheduledTime: false)
 * as `expired` because their placeholder scheduledStart was in the past. This resets any
 * such appointment back to `pending`.
 *
 * Usage:  node src/scripts/fixWalkInStatus.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { Appointment } from '../modules/appointments/appointment.model.js';

const run = async () => {
  await connectDatabase();

  const result = await Appointment.updateMany(
    { hasScheduledTime: false, status: 'expired' },
    { $set: { status: 'pending', updatedAt: new Date() } },
  );

  console.log(`Restored ${result.modifiedCount} wrongly-expired walk-in appointment(s) to pending.`);

  await mongoose.disconnect();
  console.log('Done. Disconnected.');
};

run().catch(async (err) => {
  console.error('Failed to fix walk-in statuses:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

/**
 * One-time maintenance script: fix the appointments tokenNumber unique index.
 *
 * The index `providerId_1_queueDate_1_tokenNumber_1` was originally created with
 * only `{ unique: true, sparse: true }`, which still rejects a SECOND document whose
 * tokenNumber is null on the same provider/date. The model now defines it with a
 * `partialFilterExpression` so the uniqueness only applies to real (non-null) token
 * numbers. Mongoose does not drop/recreate an index when its options change, so this
 * script drops the stale index and lets the app recreate it correctly on next boot
 * (or recreates it here directly).
 *
 * Usage:  node src/scripts/fixAppointmentIndex.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { Appointment } from '../modules/appointments/appointment.model.js';

const INDEX_NAME = 'providerId_1_queueDate_1_tokenNumber_1';

const run = async () => {
  await connectDatabase();
  const collection = Appointment.collection;

  const indexes = await collection.indexes();
  const existing = indexes.find((index) => index.name === INDEX_NAME);

  // The correct, MongoDB-supported partial filter uses `$gt: 0` (not $ne/$exists which
  // are unsupported). Always drop and recreate to guarantee the index is correct.
  const isCorrect = existing
    && existing.partialFilterExpression
    && existing.partialFilterExpression.tokenNumber
    && existing.partialFilterExpression.tokenNumber.$gt === 0
    && !existing.sparse;

  if (isCorrect) {
    console.log(`Index "${INDEX_NAME}" is already correct ($gt: 0 partial filter). Nothing to do.`);
  } else {
    if (existing) {
      console.log(`Dropping stale index "${INDEX_NAME}" (options: ${JSON.stringify({
        unique: existing.unique, sparse: existing.sparse, partialFilterExpression: existing.partialFilterExpression,
      })})`);
      await collection.dropIndex(INDEX_NAME);
      console.log('Dropped.');
    } else {
      console.log(`Index "${INDEX_NAME}" not found — it will be created fresh.`);
    }

    // Recreate with a valid partial filter so uniqueness applies only to real tokens (>= 1).
    await collection.createIndex(
      { providerId: 1, queueDate: 1, tokenNumber: 1 },
      { unique: true, partialFilterExpression: { tokenNumber: { $gt: 0 } }, name: INDEX_NAME },
    );
    console.log(`Recreated index "${INDEX_NAME}" with partialFilterExpression { tokenNumber: { $gt: 0 } }.`);
  }

  const after = await collection.indexes();
  console.log('Current indexes:');
  for (const index of after) {
    console.log(` - ${index.name}: ${JSON.stringify({
      key: index.key, unique: index.unique, partialFilterExpression: index.partialFilterExpression,
    })}`);
  }

  await mongoose.disconnect();
  console.log('Done. Disconnected.');
};

run().catch(async (err) => {
  console.error('Failed to fix appointment index:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

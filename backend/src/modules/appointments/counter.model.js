import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    // Key format: "{locationId}:{YYYY-MM-DD}" for daily reset
    key: { type: String, required: true, unique: true, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    date: { type: Date, required: true, index: true }, // YYYY-MM-DD
    current: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: 'counters', timestamps: true },
);

/**
 * Atomically increment and return the next queue number for a location on a given date
 * @param {string} locationId - MongoDB ObjectId of location
 * @param {Date} date - Date to increment counter for (will be normalized to YYYY-MM-DD)
 * @returns {Promise<number>} - Next queue number (1-based)
 */
counterSchema.statics.getNextNumber = async function (locationId, date) {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `${locationId}:${dateStr}`;

  const result = await this.findOneAndUpdate(
    { key },
    { $inc: { current: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return result.current;
};

/**
 * Reset counter for a location (used by cron jobs or admin)
 * @param {string} locationId - MongoDB ObjectId of location
 * @param {Date} date - Date to reset
 * @returns {Promise<void>}
 */
counterSchema.statics.reset = async function (locationId, date) {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `${locationId}:${dateStr}`;

  await this.updateOne(
    { key },
    { $set: { current: 0 } },
    { upsert: true }
  );
};

/**
 * Get current counter value for a location on a given date
 * @param {string} locationId - MongoDB ObjectId of location
 * @param {Date} date - Date to get counter for
 * @returns {Promise<number>} - Current counter value
 */
counterSchema.statics.getCurrentValue = async function (locationId, date) {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `${locationId}:${dateStr}`;

  const doc = await this.findOne({ key });
  return doc?.current || 0;
};

export const Counter = mongoose.model('Counter', counterSchema);

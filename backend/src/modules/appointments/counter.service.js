import { Counter } from './counter.model.js';
import { Setting } from '../settings/setting.model.js';

/**
 * Get the next queue number for an appointment at a location on a given date
 * Uses atomic increment to prevent duplicate queue numbers under concurrency
 * @param {string} locationId - MongoDB ObjectId of location
 * @param {Date} date - Date for the appointment (used to generate date key)
 * @returns {Promise<number>} - Next queue number (starting from 1)
 */
export async function getNextQueueNumber(locationId, date) {
  try {
    const queueNumber = await Counter.getNextNumber(locationId, date);
    return queueNumber;
  } catch (error) {
    console.error('Error getting next queue number:', error);
    throw new Error('Failed to generate queue number. Please try again.');
  }
}

/**
 * Reset queue counter for a location on a specific date
 * @param {string} locationId - MongoDB ObjectId of location
 * @param {Date} date - Date to reset counter for
 * @returns {Promise<void>}
 */
export async function resetCounter(locationId, date) {
  try {
    await Counter.reset(locationId, date);
  } catch (error) {
    console.error('Error resetting counter:', error);
    throw new Error('Failed to reset counter.');
  }
}

/**
 * Reset all queue counters for a specific date
 * Used by scheduler or manual trigger
 * @param {Date} date - Date to reset counters for (default: today)
 * @returns {Promise<number>} - Number of counters reset
 */
export async function resetAllCountersForDate(date = new Date()) {
  try {
    const resetDate = new Date(date);
    resetDate.setUTCHours(0, 0, 0, 0);

    const result = await Counter.deleteMany({
      date: resetDate,
    });

    console.log(`[Queue Reset] Reset ${result.deletedCount} counters for ${resetDate.toISOString().slice(0, 10)}`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error resetting all counters:', error);
    throw new Error('Failed to reset queue counters.');
  }
}

/**
 * Get current counter value for a location on a date
 * @param {string} locationId - MongoDB ObjectId of location
 * @param {Date} date - Date to get counter value for
 * @returns {Promise<number>} - Current counter value
 */
export async function getCurrentCounterValue(locationId, date) {
  try {
    const value = await Counter.getCurrentValue(locationId, date);
    return value;
  } catch (error) {
    console.error('Error getting counter value:', error);
    throw new Error('Failed to get counter value.');
  }
}

/**
 * Clean up old counters (older than specified days)
 * @param {number} daysOld - Delete counters older than this many days (default: 90)
 * @returns {Promise<number>} - Number of deleted counters
 */
export async function cleanupOldCounters(daysOld = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Counter.deleteMany({
      date: { $lt: cutoffDate },
    });

    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up counters:', error);
    throw new Error('Failed to cleanup counters.');
  }
}

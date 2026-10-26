import { Appointment } from '../../appointments/appointment.model.js';
import { PeakHourPrediction } from './peakHourPrediction.model.js';

/**
 * Analyze historical traffic patterns
 */
export const analyzeTrafficPatterns = async (options = {}) => {
  try {
    const { daysBack = 90, limit = 10000 } = options;

    console.log('[peakHourPrediction] Analyzing traffic patterns...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get all appointments in period
    const appointments = await Appointment.find({
      createdAt: { $gte: cutoffDate },
      status: { $in: ['completed', 'in_service', 'confirmed', 'queued'] },
    })
      .limit(limit)
      .lean();

    console.log(`[peakHourPrediction] Found ${appointments.length} appointments`);

    // Aggregate by hour
    const hourlyStats = new Map();

    for (const appointment of appointments) {
      const date = new Date(appointment.scheduledStart);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const key = `${dayOfWeek}-${hour}`; // e.g., "1-09" for Monday 9 AM

      if (!hourlyStats.has(key)) {
        hourlyStats.set(key, {
          hour,
          dayOfWeek,
          count: 0,
          dates: [],
        });
      }

      const stat = hourlyStats.get(key);
      stat.count++;
      stat.dates.push(date);
    }

    // Calculate statistics
    const patterns = Array.from(hourlyStats.values()).map(stat => ({
      hour: stat.hour,
      dayOfWeek: stat.dayOfWeek,
      appointmentCount: stat.count,
      avgAppointmentsPerDay: (stat.count / daysBack * 7).toFixed(2), // Normalize to weekly
    }));

    // Find peak hours (top 25%)
    const sorted = [...patterns].sort((a, b) => b.appointmentCount - a.appointmentCount);
    const threshold = sorted[Math.floor(sorted.length * 0.25)]?.appointmentCount || 0;

    const peakPatterns = patterns.filter(p => p.appointmentCount > threshold);

    console.log(`[peakHourPrediction] Identified ${peakPatterns.length} peak hour slots`);

    return {
      patterns,
      peakPatterns,
      threshold,
    };
  } catch (error) {
    console.error('[peakHourPrediction] Pattern analysis error:', error);
    throw error;
  }
};

/**
 * Generate peak hour predictions for specific date range
 */
export const generatePeakHourPredictions = async (options = {}) => {
  try {
    const { startDate = new Date(), daysAhead = 7 } = options;

    console.log('[peakHourPrediction] Generating predictions...');

    // Get historical patterns first
    const patterns = await analyzeTrafficPatterns();

    const predictions = [];
    const startTime = new Date(startDate);
    startTime.setHours(0, 0, 0, 0);

    for (let daysOffset = 0; daysOffset < daysAhead; daysOffset++) {
      const currentDate = new Date(startTime);
      currentDate.setDate(currentDate.getDate() + daysOffset);
      const dayOfWeek = currentDate.getDay();

      for (let hour = 8; hour <= 17; hour++) { // 8 AM to 5 PM
        const key = `${dayOfWeek}-${hour}`;
        const pattern = patterns.patterns.find(p => p.dayOfWeek === dayOfWeek && p.hour === hour);

        const prediction = new PeakHourPrediction({
          date: new Date(currentDate),
          hour,
          dayOfWeek,
          predictedAppointments: pattern?.appointmentCount || Math.round(patterns.patterns.reduce((sum, p) => sum + p.appointmentCount, 0) / patterns.patterns.length),
          isPeakHour: pattern && pattern.appointmentCount > patterns.threshold,
          confidence: 0.75,
          basis: 'historical_pattern',
        });

        predictions.push(prediction);
      }
    }

    // Bulk insert
    await PeakHourPrediction.insertMany(predictions, { ordered: false });

    console.log(`[peakHourPrediction] Generated ${predictions.length} predictions`);

    return {
      success: true,
      predictionsCreated: predictions.length,
      dateRange: `${startTime.toISOString()} to ${new Date(startTime.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString()}`,
    };
  } catch (error) {
    console.error('[peakHourPrediction] Prediction generation error:', error);
    throw error;
  }
};

/**
 * Get peak hours for a specific date
 */
export const getPeakHoursForDate = async (date) => {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const predictions = await PeakHourPrediction.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort('hour')
      .lean();

    const peakHours = predictions.filter(p => p.isPeakHour);
    const offPeakHours = predictions.filter(p => !p.isPeakHour);

    return {
      date: date.toISOString().split('T')[0],
      peakHours,
      offPeakHours,
      recommendation: peakHours.length > 0 
        ? `Recommend booking during off-peak hours: ${offPeakHours.map(h => `${h.hour}:00`).join(', ')}`
        : 'No peak hours predicted for this day',
    };
  } catch (error) {
    console.error('[peakHourPrediction] Error getting peak hours:', error);
    throw error;
  }
};

/**
 * Get trending hours (busiest periods)
 */
export const getTrendingHours = async (options = {}) => {
  try {
    const { days = 7 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const predictions = await PeakHourPrediction.find({
      date: { $gte: startDate },
      isPeakHour: true,
    })
      .lean();

    // Group by hour of day
    const hourlyTrends = {};

    for (const pred of predictions) {
      const hour = pred.hour;
      if (!hourlyTrends[hour]) {
        hourlyTrends[hour] = {
          hour,
          peakDays: 0,
          avgAppointments: 0,
        };
      }
      hourlyTrends[hour].peakDays++;
      hourlyTrends[hour].avgAppointments += pred.predictedAppointments;
    }

    // Calculate averages
    for (const hour in hourlyTrends) {
      hourlyTrends[hour].avgAppointments = (
        hourlyTrends[hour].avgAppointments / hourlyTrends[hour].peakDays
      ).toFixed(0);
    }

    const sorted = Object.values(hourlyTrends).sort((a, b) => b.peakDays - a.peakDays);

    return {
      period: `Last ${days} days`,
      trendingHours: sorted.slice(0, 5),
      recommendations: sorted.slice(0, 3).map(h => `${h.hour}:00 (${h.peakDays} days)`),
    };
  } catch (error) {
    console.error('[peakHourPrediction] Error getting trends:', error);
    throw error;
  }
};

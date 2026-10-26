import { trainNoShowModel, predictNoShowProbability, logAndActionNoShowPrediction, getNoShowRiskActions } from './noShowPrediction.service.js';
import { trainWaitTimeModel, predictWaitTime, logWaitTimePrediction } from './waitTimePrediction.service.js';
import { generatePeakHourPredictions, getPeakHoursForDate, getTrendingHours } from './peakHourPrediction.service.js';
import { Appointment } from '../../appointments/appointment.model.js';
import { NoShowHistory } from './noShow.model.js';
import { WaitTimeHistory } from './waitTimeHistory.model.js';

/**
 * Train no-show model
 */
export const trainNoShowModelEndpoint = async (req, res, next) => {
  try {
    const result = await trainNoShowModel();
    return res.json({
      message: 'No-show model trained successfully',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Predict no-show risk for an appointment
 */
export const predictNoShowRisk = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findById(appointmentId).lean();
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const prediction = await predictNoShowProbability(appointment);
    const actions = getNoShowRiskActions(prediction.probability);

    return res.json({
      appointmentId,
      prediction: {
        probability: (prediction.probability * 100).toFixed(1) + '%',
        riskLevel: prediction.riskLevel,
        recommendedActions: actions.actions,
      },
      features: prediction.features,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Train wait-time model
 */
export const trainWaitTimeModelEndpoint = async (req, res, next) => {
  try {
    const result = await trainWaitTimeModel();
    return res.json({
      message: 'Wait-time model trained successfully',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Predict wait time for appointment
 */
export const predictWaitTimeForAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;
    const { queueSize } = req.body;

    const appointment = await Appointment.findById(appointmentId).lean();
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const queueState = {
      queueSize: queueSize || 0,
      avgServiceTime: 15, // Default
    };

    const prediction = await predictWaitTime(appointment, queueState);

    return res.json({
      appointmentId,
      estimatedWaitMinutes: prediction.estimatedWaitMinutes,
      confidence: prediction.confidence,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate peak hour predictions
 */
export const generatePeakHourPredictionsEndpoint = async (req, res, next) => {
  try {
    const { daysAhead = 7 } = req.body;

    const result = await generatePeakHourPredictions({ daysAhead });

    return res.json({
      message: 'Peak hour predictions generated',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get peak hours for a date
 */
export const getPeakHoursForDateEndpoint = async (req, res, next) => {
  try {
    const { date } = req.params;

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const result = await getPeakHoursForDate(parsedDate);

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get trending hours
 */
export const getTrendingHoursEndpoint = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;

    const result = await getTrendingHours({ days: Number(days) });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get prediction statistics
 */
export const getPredictionStatistics = async (req, res, next) => {
  try {
    const { daysBack = 30 } = req.query;

    const noShowStats = await NoShowHistory.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: '$outcome',
          count: { $sum: 1 },
          avgPredicted: { $avg: '$predictedProbability' },
        },
      },
    ]);

    const waitTimeStats = await WaitTimeHistory.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) },
          actualWaitMinutes: { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          avgPredicted: { $avg: '$predictedWaitMinutes' },
          avgActual: { $avg: '$actualWaitMinutes' },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.json({
      period: `Last ${daysBack} days`,
      noShowAnalysis: noShowStats,
      waitTimeAnalysis: waitTimeStats[0] || {},
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
};

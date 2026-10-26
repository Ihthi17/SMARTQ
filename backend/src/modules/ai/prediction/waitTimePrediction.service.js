import { Appointment } from '../../appointments/appointment.model.js';
import { WaitTimeHistory } from './waitTimeHistory.model.js';
import { WaitTimePredictionModel } from './waitTimePredictionModel.model.js';

// Simple Polynomial Regression Implementation (Degree 2)
class PolynomialRegression {
  constructor(X, y, degree = 2, options = {}) {
    this.degree = degree;
    this.learningRate = options.learningRate || 0.01;
    this.iterations = options.iterations || 100;
    this.coefficients = [];

    if (X && y) {
      this.fit(X, y);
    }
  }

  // Transform features to polynomial features
  transformFeatures(x) {
    const transformed = [1]; // bias term
    for (let i = 0; i < x.length; i++) {
      transformed.push(x[i]);
      if (this.degree >= 2) {
        transformed.push(x[i] * x[i]);
      }
    }
    return transformed;
  }

  fit(X, y) {
    const n = X.length;
    const m = X[0].length * (this.degree + 1);

    this.coefficients = Array(m).fill(0.001);

    for (let iter = 0; iter < this.iterations; iter++) {
      const gradients = Array(m).fill(0);

      for (let i = 0; i < n; i++) {
        const xTransformed = this.transformFeatures(X[i]);
        let prediction = 0;
        for (let j = 0; j < m; j++) {
          prediction += this.coefficients[j] * xTransformed[j];
        }

        const error = prediction - y[i];
        for (let j = 0; j < m; j++) {
          gradients[j] += error * xTransformed[j];
        }
      }

      for (let j = 0; j < m; j++) {
        this.coefficients[j] -= (this.learningRate / n) * gradients[j];
      }
    }
  }

  predict(X) {
    return X.map((sample) => {
      const xTransformed = this.transformFeatures(sample);
      let prediction = 0;
      for (let j = 0; j < this.coefficients.length; j++) {
        prediction += this.coefficients[j] * xTransformed[j];
      }
      return Math.max(1, prediction); // Minimum 1 minute
    });
  }
}

/**
 * Extract features from queue state for wait-time prediction
 */
export const extractWaitTimeFeatures = async (appointment, queueState = {}) => {
  if (!appointment) {
    throw new Error('Appointment is required for wait-time feature extraction');
  }

  try {
    const scheduledDate = new Date(appointment.scheduledStart || new Date());
    const dayOfWeek = scheduledDate.getDay(); // 0-6
    const hourOfDay = scheduledDate.getHours(); // 0-23
    const timeOfDay = hourOfDay < 12 ? 'morning' : hourOfDay < 17 ? 'afternoon' : 'evening';

    // Current queue size at time of this appointment
    const queueSize = queueState.queueSize || 0;
    const avgServiceTime = queueState.avgServiceTime || 15; // Default 15 mins

    return {
      queueSize,
      timeOfDay,
      dayOfWeek,
      hourOfDay,
      serviceCode: appointment.serviceCode || 'GENERAL',
      priority: appointment.priority || 'normal',
      avgServiceTime,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isMorning: hourOfDay < 12,
    };
  } catch (error) {
    console.error('[waitTimePrediction] Feature extraction error:', error);
    throw error;
  }
};

/**
 * Normalize features for model input
 */
const normalizeWaitTimeFeatures = (features) => {
  return {
    queueSize: Math.min(features.queueSize / 50, 1), // Normalize to max 50
    dayOfWeek: features.dayOfWeek / 6,
    hourOfDay: features.hourOfDay / 23,
    avgServiceTime: Math.min(features.avgServiceTime / 60, 1), // Normalize to 60 mins max
    isMorning: features.isMorning ? 1 : 0,
    isWeekend: features.isWeekend ? 1 : 0,
    priorityMultiplier: features.priority === 'emergency' ? 2 : features.priority === 'high' ? 1.5 : 1,
  };
};

/**
 * Convert normalized features to array
 */
const featuresToArray = (normalizedFeatures) => {
  return [
    normalizedFeatures.queueSize,
    normalizedFeatures.dayOfWeek,
    normalizedFeatures.hourOfDay,
    normalizedFeatures.avgServiceTime,
    normalizedFeatures.isMorning,
    normalizedFeatures.isWeekend,
    normalizedFeatures.priorityMultiplier,
  ];
};

/**
 * Collect historical wait-time data
 */
export const collectWaitTimeData = async (options = {}) => {
  const { daysBack = 90, limit = 5000 } = options;

  try {
    console.log('[waitTimePrediction] Collecting wait-time data...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get completed and in_service appointments (those that have actual wait times)
    const appointments = await Appointment.find({
      status: { $in: ['completed', 'in_service'] },
      checkedInAt: { $exists: true },
      queueJoinedAt: { $exists: true },
      calledAt: { $exists: true },
      createdAt: { $gte: cutoffDate },
    })
      .limit(limit)
      .lean();

    console.log(`[waitTimePrediction] Found ${appointments.length} completed appointments`);

    const waitTimeData = [];

    for (const appointment of appointments) {
      try {
        // Calculate actual wait time (from queue join to service call)
        const queueJoinTime = new Date(appointment.queueJoinedAt);
        const calledTime = new Date(appointment.calledAt);
        const actualWaitMinutes = (calledTime - queueJoinTime) / (1000 * 60);

        // Calculate service duration
        const serviceStart = calledTime;
        const serviceEnd = new Date(appointment.completedAt || calledTime);
        const actualServiceMinutes = (serviceEnd - serviceStart) / (1000 * 60);

        // Extract features
        const features = await extractWaitTimeFeatures(appointment, {
          queueSize: appointment.queueNumber || 5, // Estimate
          avgServiceTime: actualServiceMinutes,
        });

        const normalizedFeatures = normalizeWaitTimeFeatures(features);
        const featureArray = featuresToArray(normalizedFeatures);

        waitTimeData.push({
          features: featureArray,
          outcome: Math.max(0, actualWaitMinutes), // Target: actual wait in minutes
          appointmentId: appointment._id,
          features_snapshot: features,
          actualWaitMinutes,
          actualServiceMinutes,
        });
      } catch (error) {
        console.warn(`[waitTimePrediction] Error processing appointment ${appointment._id}:`, error.message);
      }
    }

    console.log(`[waitTimePrediction] Prepared ${waitTimeData.length} wait-time samples`);
    return waitTimeData;
  } catch (error) {
    console.error('[waitTimePrediction] Data collection error:', error);
    throw error;
  }
};

/**
 * Train wait-time prediction model
 */
export const trainWaitTimeModel = async (options = {}) => {
  try {
    console.log('[waitTimePrediction] Starting model training...');

    const trainingData = await collectWaitTimeData(options);

    if (trainingData.length < 50) {
      throw new Error(`Insufficient training data: ${trainingData.length} samples (need at least 50)`);
    }

    // Prepare data
    const X = trainingData.map(d => d.features);
    const y = trainingData.map(d => d.outcome);

    // Train polynomial regression (degree 2)
    const model = new PolynomialRegression(X, y, 2);

    // Calculate MAE (Mean Absolute Error)
    let totalError = 0;
    for (let i = 0; i < X.length; i++) {
      const predicted = model.predict(X[i]);
      const error = Math.abs(predicted - y[i]);
      totalError += error;
    }
    const mae = totalError / X.length;

    console.log(`[waitTimePrediction] Model training complete. MAE: ${mae.toFixed(2)} minutes`);

    // Save model
    const modelData = {
      modelType: 'polynomial_regression',
      degree: 2,
      mae,
      samplesUsed: trainingData.length,
      trainedAt: new Date(),
      coefficients: model.coefficients,
      featureNames: [
        'queueSize',
        'dayOfWeek',
        'hourOfDay',
        'avgServiceTime',
        'isMorning',
        'isWeekend',
        'priorityMultiplier',
      ],
    };

    await WaitTimePredictionModel.findOneAndUpdate(
      { version: 'current' },
      modelData,
      { upsert: true }
    );

    console.log('[waitTimePrediction] Model saved to database');
    return { success: true, mae, samplesUsed: trainingData.length };
  } catch (error) {
    console.error('[waitTimePrediction] Model training error:', error);
    throw error;
  }
};

/**
 * Load trained model
 */
const loadTrainedWaitTimeModel = async () => {
  try {
    const modelData = await WaitTimePredictionModel.findOne({ version: 'current' }).lean();
    if (!modelData) {
      throw new Error('No trained wait-time model found. Run trainWaitTimeModel first.');
    }
    return modelData;
  } catch (error) {
    console.error('[waitTimePrediction] Failed to load model:', error);
    throw error;
  }
};

/**
 * Predict wait time for an appointment
 */
export const predictWaitTime = async (appointment, queueState = {}) => {
  try {
    const features = await extractWaitTimeFeatures(appointment, queueState);
    const normalizedFeatures = normalizeWaitTimeFeatures(features);
    const featureArray = featuresToArray(normalizedFeatures);

    const modelData = await loadTrainedWaitTimeModel();

    // Simple linear prediction from coefficients
    let prediction = 0;
    for (let i = 0; i < Math.min(modelData.coefficients.length, featureArray.length); i++) {
      prediction += (modelData.coefficients[i] || 0) * featureArray[i];
    }

    // Clamp to reasonable range (0-120 minutes)
    const waitMinutes = Math.max(0, Math.min(120, prediction));

    return {
      estimatedWaitMinutes: Math.round(waitMinutes),
      confidence: 0.75, // Placeholder
      features,
    };
  } catch (error) {
    console.error('[waitTimePrediction] Prediction error:', error);
    // Return default estimate on error
    return {
      estimatedWaitMinutes: 15, // Default to 15 min
      confidence: 0.3,
      error: error.message,
      features: null,
    };
  }
};

/**
 * Log wait-time prediction to history
 */
export const logWaitTimePrediction = async (appointment, queueState = {}) => {
  try {
    const prediction = await predictWaitTime(appointment, queueState);

    const historyEntry = new WaitTimeHistory({
      appointmentId: appointment._id,
      providerId: appointment.providerId,
      queueDate: appointment.queueDate,
      predictedWaitMinutes: prediction.estimatedWaitMinutes,
      features_snapshot: prediction.features,
    });

    if (prediction.features) {
      historyEntry.timeOfDay = prediction.features.timeOfDay;
      historyEntry.dayOfWeek = prediction.features.dayOfWeek;
      historyEntry.queueSize = queueState.queueSize || 0;
      historyEntry.serviceCode = appointment.serviceCode;
    }

    await historyEntry.save();

    return {
      success: true,
      predictedWaitMinutes: prediction.estimatedWaitMinutes,
      historyId: historyEntry._id,
    };
  } catch (error) {
    console.error('[waitTimePrediction] Error logging prediction:', error);
    throw error;
  }
};

/**
 * Record actual wait time after appointment
 */
export const recordActualWaitTime = async (appointmentId, actualWaitMinutes, actualServiceMinutes) => {
  try {
    const updated = await WaitTimeHistory.findOneAndUpdate(
      { appointmentId },
      {
        actualWaitMinutes,
        actualServiceMinutes,
      },
      { new: true }
    );

    if (!updated) {
      console.warn(`[waitTimePrediction] No history entry found for appointment ${appointmentId}`);
    }

    return updated;
  } catch (error) {
    console.error('[waitTimePrediction] Error recording actual time:', error);
    throw error;
  }
};

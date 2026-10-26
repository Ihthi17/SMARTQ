import { NoShowHistory } from './noShow.model.js';
import { Appointment } from '../../appointments/appointment.model.js';
import { User } from '../../users/user.model.js';
import { Notification } from '../../notifications/notification.model.js';
import { NoShowPredictionModel } from './noShowPredictionModel.model.js';

// Simple Logistic Regression Implementation
class LogisticRegression {
  constructor(X, y, options = {}) {
    this.learningRate = options.learningRate || 0.01;
    this.iterations = options.iterations || 100;
    this.coefficients = [];
    this.intercept = 0;

    if (X && y) {
      this.fit(X, y);
    }
  }

  sigmoid(z) {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
  }

  fit(X, y) {
    const n = X.length;
    const m = X[0].length;

    this.coefficients = Array(m).fill(0);
    this.intercept = 0;

    for (let iter = 0; iter < this.iterations; iter++) {
      let intercept_gradient = 0;
      const coef_gradients = Array(m).fill(0);

      for (let i = 0; i < n; i++) {
        let z = this.intercept;
        for (let j = 0; j < m; j++) {
          z += this.coefficients[j] * X[i][j];
        }

        const prediction = this.sigmoid(z);
        const error = prediction - y[i];

        intercept_gradient += error;
        for (let j = 0; j < m; j++) {
          coef_gradients[j] += error * X[i][j];
        }
      }

      this.intercept -= (this.learningRate / n) * intercept_gradient;
      for (let j = 0; j < m; j++) {
        this.coefficients[j] -= (this.learningRate / n) * coef_gradients[j];
      }
    }
  }

  predict(X) {
    return X.map((sample) => {
      let z = this.intercept;
      for (let j = 0; j < sample.length; j++) {
        z += this.coefficients[j] * sample[j];
      }
      return this.sigmoid(z);
    });
  }
}

/**
 * Extract features from an appointment for no-show prediction
 */
export const extractNoShowFeatures = async (appointment) => {
  if (!appointment) {
    throw new Error('Appointment is required for feature extraction');
  }

  try {
    // Booking lead hours: time between creation and scheduled start
    const bookingLeadHours = Math.max(
      0,
      (new Date(appointment.scheduledStart) - new Date(appointment.createdAt)) / (1000 * 60 * 60)
    );

    // Get user's appointment history
    let previousNoShows = 0;
    let previousCompleted = 0;

    if (appointment.userId) {
      const userAppointments = await Appointment.find({
        userId: appointment.userId,
        _id: { $ne: appointment._id },
      }).lean();

      previousNoShows = userAppointments.filter(a => a.status === 'no_show').length;
      previousCompleted = userAppointments.filter(a => a.status === 'completed').length;
    }

    // Extract temporal features
    const scheduledDate = new Date(appointment.scheduledStart);
    const dayOfWeek = scheduledDate.getDay(); // 0-6
    const hourOfDay = scheduledDate.getHours(); // 0-23

    // Check if reminder was sent
    const reminderSent = appointment.userId ? !!(
      await Notification.exists({
        userId: appointment.userId,
        appointmentId: appointment._id,
        channel: { $in: ['sms', 'email', 'whatsapp'] },
      })
    ) : false;

    return {
      bookingLeadHours,
      previousNoShows,
      previousCompleted,
      dayOfWeek,
      hourOfDay,
      bookingType: appointment.bookingType || 'in_person',
      priority: appointment.priority || 'normal',
      reminderSent,
    };
  } catch (error) {
    console.error('[noShowPrediction] Feature extraction error:', error);
    throw error;
  }
};

/**
 * Normalize features for model input
 */
const normalizeFeatures = (features) => {
  return {
    bookingLeadHours: Math.min(features.bookingLeadHours / 720, 1), // Cap at 30 days
    previousNoShows: Math.min(features.previousNoShows / 10, 1),
    previousCompleted: Math.min(features.previousCompleted / 50, 1),
    dayOfWeek: features.dayOfWeek / 6,
    hourOfDay: features.hourOfDay / 23,
    bookingTypeVirtual: features.bookingType === 'virtual' ? 1 : 0,
    priorityHigh: features.priority === 'high' ? 1 : 0,
    priorityEmergency: features.priority === 'emergency' ? 1 : 0,
    reminderSent: features.reminderSent ? 1 : 0,
  };
};

/**
 * Convert normalized features to array for model input
 */
const featuresToArray = (normalizedFeatures) => {
  return [
    normalizedFeatures.bookingLeadHours,
    normalizedFeatures.previousNoShows,
    normalizedFeatures.previousCompleted,
    normalizedFeatures.dayOfWeek,
    normalizedFeatures.hourOfDay,
    normalizedFeatures.bookingTypeVirtual,
    normalizedFeatures.priorityHigh,
    normalizedFeatures.priorityEmergency,
    normalizedFeatures.reminderSent,
  ];
};

/**
 * Collect historical data and prepare for training
 */
export const collectTrainingData = async (options = {}) => {
  const { daysBack = 180, limit = 10000 } = options;

  try {
    console.log('[noShowPrediction] Collecting training data...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get completed, no_show, and cancelled appointments
    const appointments = await Appointment.find({
      status: { $in: ['completed', 'no_show', 'cancelled'] },
      createdAt: { $gte: cutoffDate },
    })
      .limit(limit)
      .lean();

    console.log(`[noShowPrediction] Found ${appointments.length} historical appointments`);

    // Extract features for each
    const trainingData = [];

    for (const appointment of appointments) {
      try {
        const features = await extractNoShowFeatures(appointment);
        const normalizedFeatures = normalizeFeatures(features);
        const featureArray = featuresToArray(normalizedFeatures);

        // Outcome: 1 = no_show, 0 = attended (completed or cancelled without being no-show)
        const outcome = appointment.status === 'no_show' ? 1 : 0;

        trainingData.push({
          features: featureArray,
          outcome,
          appointmentId: appointment._id,
          features_snapshot: features,
        });
      } catch (error) {
        console.warn(`[noShowPrediction] Error processing appointment ${appointment._id}:`, error.message);
      }
    }

    console.log(`[noShowPrediction] Prepared ${trainingData.length} training samples`);
    return trainingData;
  } catch (error) {
    console.error('[noShowPrediction] Training data collection error:', error);
    throw error;
  }
};

/**
 * Train the no-show prediction model
 */
export const trainNoShowModel = async (options = {}) => {
  try {
    console.log('[noShowPrediction] Starting model training...');

    // Collect training data
    const trainingData = await collectTrainingData(options);

    if (trainingData.length < 100) {
      throw new Error(`Insufficient training data: ${trainingData.length} samples (need at least 100)`);
    }

    // Prepare data for training
    const X = trainingData.map(d => d.features);
    const y = trainingData.map(d => d.outcome);

    // Train logistic regression model
    const model = new LogisticRegression(X, y);

    // Calculate model accuracy on training set
    let correct = 0;
    for (let i = 0; i < X.length; i++) {
      const prediction = model.predict([X[i]])[0];
      const predictedClass = prediction > 0.5 ? 1 : 0;
      if (predictedClass === y[i]) correct++;
    }

    const accuracy = correct / X.length;

    console.log(`[noShowPrediction] Model training complete. Accuracy: ${(accuracy * 100).toFixed(2)}%`);

    // Save model to database
    const modelData = {
      modelType: 'logistic_regression',
      accuracy,
      samplesUsed: trainingData.length,
      trainedAt: new Date(),
      coefficients: model.coefficients,
      intercept: model.intercept,
      featureNames: [
        'bookingLeadHours',
        'previousNoShows',
        'previousCompleted',
        'dayOfWeek',
        'hourOfDay',
        'bookingTypeVirtual',
        'priorityHigh',
        'priorityEmergency',
        'reminderSent',
      ],
    };

    await NoShowPredictionModel.findOneAndUpdate(
      { version: 'current' },
      modelData,
      { upsert: true }
    );

    console.log('[noShowPrediction] Model saved to database');
    return { success: true, accuracy, samplesUsed: trainingData.length };
  } catch (error) {
    console.error('[noShowPrediction] Model training error:', error);
    throw error;
  }
};

/**
 * Load the trained model from database
 */
const loadTrainedModel = async () => {
  try {
    const modelData = await NoShowPredictionModel.findOne({ version: 'current' }).lean();
    if (!modelData) {
      throw new Error('No trained model found. Run trainNoShowModel first.');
    }
    return modelData;
  } catch (error) {
    console.error('[noShowPrediction] Failed to load model:', error);
    throw error;
  }
};

/**
 * Predict no-show probability for an appointment
 */
export const predictNoShowProbability = async (appointment) => {
  try {
    // Extract and normalize features
    const features = await extractNoShowFeatures(appointment);
    const normalizedFeatures = normalizeFeatures(features);
    const featureArray = featuresToArray(normalizedFeatures);

    // Load trained model
    const modelData = await loadTrainedModel();

    // Simple logistic prediction using coefficients
    // P(no_show) = 1 / (1 + exp(-(intercept + sum(coef * feature))))
    let z = modelData.intercept || 0;

    for (let i = 0; i < modelData.coefficients.length; i++) {
      z += modelData.coefficients[i] * featureArray[i];
    }

    const probability = 1 / (1 + Math.exp(-z));

    return {
      probability: Math.max(0, Math.min(1, probability)), // Clamp to [0, 1]
      riskLevel: probability > 0.7 ? 'high' : probability > 0.4 ? 'medium' : 'low',
      features,
    };
  } catch (error) {
    console.error('[noShowPrediction] Prediction error:', error);
    // Return neutral prediction on error
    return {
      probability: 0.3, // Default to low risk
      riskLevel: 'low',
      error: error.message,
      features: null,
    };
  }
};

/**
 * Log prediction to history and trigger actions
 */
export const logAndActionNoShowPrediction = async (appointment, userId) => {
  try {
    const prediction = await predictNoShowProbability(appointment);

    const historyEntry = new NoShowHistory({
      userId: appointment.userId,
      appointmentId: appointment._id,
      providerId: appointment.providerId,
      scheduledStart: appointment.scheduledStart,
      predictedProbability: prediction.probability,
      featureSnapshot: prediction.features,
      outcome: null, // Will be updated when appointment completes
    });

    await historyEntry.save();

    // Extract features for logging
    if (prediction.features) {
      historyEntry.bookingLeadHours = prediction.features.bookingLeadHours;
      historyEntry.previousNoShows = prediction.features.previousNoShows;
      historyEntry.previousCompleted = prediction.features.previousCompleted;
      historyEntry.dayOfWeek = prediction.features.dayOfWeek;
      historyEntry.hourOfDay = prediction.features.hourOfDay;
      historyEntry.bookingType = prediction.features.bookingType;
      historyEntry.priority = appointment.priority;
      historyEntry.reminderSent = prediction.features.reminderSent;

      await historyEntry.save();
    }

    return {
      success: true,
      prediction: prediction.probability,
      riskLevel: prediction.riskLevel,
      historyId: historyEntry._id,
    };
  } catch (error) {
    console.error('[noShowPrediction] Error logging prediction:', error);
    throw error;
  }
};

/**
 * Get risk-based action recommendations
 */
export const getNoShowRiskActions = (probability) => {
  const actions = [];

  if (probability > 0.7) {
    actions.push({
      level: 'high',
      actions: [
        'Send immediate reminder SMS/email',
        'Flag for staff review',
        'Consider suggesting reschedule with incentive',
        'Request phone confirmation',
      ],
    });
  } else if (probability > 0.4) {
    actions.push({
      level: 'medium',
      actions: [
        'Send automated reminder 24 hours before',
        'Include confirmation link in notification',
      ],
    });
  } else {
    actions.push({
      level: 'low',
      actions: [
        'Standard reminder notification',
      ],
    });
  }

  return actions[0];
};

/**
 * Update appointment outcome after completion
 */
export const recordNoShowOutcome = async (appointmentId, outcome) => {
  try {
    if (!['attended', 'no_show', 'cancelled'].includes(outcome)) {
      throw new Error(`Invalid outcome: ${outcome}`);
    }

    const updated = await NoShowHistory.findOneAndUpdate(
      { appointmentId },
      { outcome },
      { new: true }
    );

    if (!updated) {
      console.warn(`[noShowPrediction] No history entry found for appointment ${appointmentId}`);
    }

    return updated;
  } catch (error) {
    console.error('[noShowPrediction] Error recording outcome:', error);
    throw error;
  }
};

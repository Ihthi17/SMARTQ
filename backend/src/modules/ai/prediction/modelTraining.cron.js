import cron from 'node-cron';
import { trainNoShowModel } from './noShowPrediction.service.js';
import { trainWaitTimeModel } from './waitTimePrediction.service.js';
import { generatePeakHourPredictions } from './peakHourPrediction.service.js';

/**
 * Schedule automated model training
 */
export const scheduleModelTraining = () => {
  try {
    console.log('[AI] Scheduling model training jobs...');

    // Train no-show model every Sunday at 2 AM
    cron.schedule('0 2 * * 0', async () => {
      console.log('[AI] Starting scheduled no-show model training...');
      try {
        const result = await trainNoShowModel({ daysBack: 180 });
        console.log('[AI] No-show model training completed:', result);
      } catch (error) {
        console.error('[AI] No-show model training failed:', error.message);
      }
    });

    // Train wait-time model every Saturday at 3 AM
    cron.schedule('0 3 * * 6', async () => {
      console.log('[AI] Starting scheduled wait-time model training...');
      try {
        const result = await trainWaitTimeModel({ daysBack: 90 });
        console.log('[AI] Wait-time model training completed:', result);
      } catch (error) {
        console.error('[AI] Wait-time model training failed:', error.message);
      }
    });

    // Generate peak-hour predictions daily at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('[AI] Generating peak-hour predictions for next 7 days...');
      try {
        const result = await generatePeakHourPredictions({ daysAhead: 7 });
        console.log('[AI] Peak-hour predictions generated:', result);
      } catch (error) {
        console.error('[AI] Peak-hour prediction generation failed:', error.message);
      }
    });

    console.log('[AI] Model training jobs scheduled successfully');
  } catch (error) {
    console.error('[AI] Failed to schedule model training:', error);
    throw error;
  }
};

/**
 * Manual trigger for immediate model training
 */
export const triggerModelTrainingNow = async (modelType = 'all') => {
  try {
    const results = {};

    if (modelType === 'all' || modelType === 'no-show') {
      console.log('[AI] Training no-show model immediately...');
      results.noShow = await trainNoShowModel();
    }

    if (modelType === 'all' || modelType === 'wait-time') {
      console.log('[AI] Training wait-time model immediately...');
      results.waitTime = await trainWaitTimeModel();
    }

    if (modelType === 'all' || modelType === 'peak-hours') {
      console.log('[AI] Generating peak-hour predictions immediately...');
      results.peakHours = await generatePeakHourPredictions({ daysAhead: 7 });
    }

    console.log('[AI] Model training completed:', results);
    return results;
  } catch (error) {
    console.error('[AI] Model training error:', error);
    throw error;
  }
};

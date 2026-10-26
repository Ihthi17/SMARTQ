import { Router } from 'express';
import { protect, authorizePermission } from '../../../middlewares/auth.middleware.js';
import {
  trainNoShowModelEndpoint,
  predictNoShowRisk,
  trainWaitTimeModelEndpoint,
  predictWaitTimeForAppointment,
  generatePeakHourPredictionsEndpoint,
  getPeakHoursForDateEndpoint,
  getTrendingHoursEndpoint,
  getPredictionStatistics,
} from './prediction.controller.js';

const router = Router();

// Prediction endpoints
const managePredictions = [protect, authorizePermission('analytics.manage')];
const viewPredictions = [protect, authorizePermission('analytics.view')];

// No-show prediction
router.post('/no-show/train', ...managePredictions, trainNoShowModelEndpoint);
router.get('/no-show/:appointmentId', ...viewPredictions, predictNoShowRisk);

// Wait-time prediction
router.post('/wait-time/train', ...managePredictions, trainWaitTimeModelEndpoint);
router.post('/wait-time/:appointmentId', ...viewPredictions, predictWaitTimeForAppointment);

// Peak-hour prediction
router.post('/peak-hours/generate', ...managePredictions, generatePeakHourPredictionsEndpoint);
router.get('/peak-hours/:date', ...viewPredictions, getPeakHoursForDateEndpoint);
router.get('/trending-hours', ...viewPredictions, getTrendingHoursEndpoint);

// Statistics
router.get('/statistics', ...viewPredictions, getPredictionStatistics);

export default router;

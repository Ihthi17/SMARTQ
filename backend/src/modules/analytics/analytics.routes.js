import { Router } from 'express';
import { protect, authorizePermission } from '../../middlewares/auth.middleware.js';
import { getQueueAnalytics, getPeakHoursAnalytics, getStaffPerformanceAnalytics } from './analytics.controller.js';

const router = Router();
const viewAnalytics = [protect, authorizePermission('appointments.view')];

router.get('/queue', ...viewAnalytics, getQueueAnalytics);
router.get('/queue/peak-hours', ...viewAnalytics, getPeakHoursAnalytics);
router.get('/queue/staff-performance', ...viewAnalytics, getStaffPerformanceAnalytics);

export default router;

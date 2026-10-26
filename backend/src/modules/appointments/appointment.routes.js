import { Router } from 'express';
import { protect, optionalProtect, authorizePermission } from '../../middlewares/auth.middleware.js';
import {
  listProviders, listStaff, create, listMine, listAll, checkIn, getStatus, setPriority, cancel, updateAppointment,
  staffCheckIn, sendAppointmentAlert, deleteAppointment, sendNotification, getNotificationHistory, reject,
  confirmAppointment, getQrImage, getQrCode, refreshQrToken, scanQrToken, validateCheckInCode, checkInByCode, checkInAppointment, manualCheckIn,
  downloadRequirementFile, updateTokenColor,
} from './appointment.controller.js';
import {
  createRecurringSeries, getRecurringSeries, pauseRecurringSeries, resumeRecurringSeries, cancelRecurringSeries,
} from './recurring.controller.js';
import {
  getWaitingListForLocation, confirmWaitingListSlot, cancelWaitingListSlot,
} from './waiting-list.controller.js';
import {
  callCustomerEndpoint, recallCustomerEndpoint, markCheckedInEndpoint,
  getCallStatusHistoryEndpoint, resetCallStatusEndpoint, getQueueRecallSettingsEndpoint,
} from './queue-recall.controller.js';
import {
  scanRateLimiter, checkInRateLimiter, qrTokenRateLimiter, confirmRateLimiter,
} from './appointment.rateLimiter.js';
import { uploadRequirementFiles } from './appointment-upload.js';

const router = Router();
const viewAppointments = [protect, authorizePermission('appointments.view')];
const manageAppointments = [protect, authorizePermission('appointments.manage')];

router.get('/providers', listProviders);
router.get('/staff', ...viewAppointments, listStaff);
router.post('/', optionalProtect, uploadRequirementFiles, create);
router.get('/mine', protect, listMine);
router.get('/', ...viewAppointments, listAll);
router.get('/:id/requirements/:fieldName/:fileId', ...viewAppointments, downloadRequirementFile);
router.patch('/:id', ...manageAppointments, updateAppointment);
router.post('/:id/staff-check-in', ...manageAppointments, staffCheckIn);
router.post('/:id/email-alert', ...manageAppointments, sendAppointmentAlert);
router.post('/:id/notify', ...manageAppointments, sendNotification);
router.get('/:id/notifications', ...viewAppointments, getNotificationHistory);
router.delete('/:id', ...manageAppointments, deleteAppointment);
router.get('/:id/status', getStatus);
router.post('/:id/check-in', checkIn);
router.patch('/:id/priority', ...manageAppointments, setPriority);
router.post('/:id/cancel', ...manageAppointments, cancel);
router.post('/:id/reject', ...manageAppointments, reject);

// QR Check-in endpoints (Part 3)
router.patch('/:id/confirm', ...manageAppointments, confirmRateLimiter, confirmAppointment);
router.patch('/:id/token-color', ...manageAppointments, updateTokenColor);  // Update token display color
router.get('/:id/qr-image/:token', getQrImage);  // Get dynamic QR image (public, token-protected)
router.get('/:id/qr/:token', getQrCode);         // Get dynamic QR code with countdown (public, token-protected)
router.post('/:id/refresh-qr', protect, qrTokenRateLimiter, refreshQrToken);
router.post('/scan', ...manageAppointments, scanRateLimiter, scanQrToken);
router.post('/checkin-by-code', ...manageAppointments, checkInByCode);  // Check-in using 8-digit code
router.post('/validate-code', ...manageAppointments, validateCheckInCode);
router.post('/:id/checkin', ...manageAppointments, checkInRateLimiter, checkInAppointment);
router.patch('/:id/manual-checkin', ...manageAppointments, checkInRateLimiter, manualCheckIn);

// Queue Recall/Remind endpoints
router.post('/:id/call', ...manageAppointments, callCustomerEndpoint);
router.post('/:id/recall', ...manageAppointments, recallCustomerEndpoint);
router.post('/:id/checked-in', ...manageAppointments, markCheckedInEndpoint);
router.get('/:id/call-status', ...viewAppointments, getCallStatusHistoryEndpoint);
router.get('/queue-recall/settings', getQueueRecallSettingsEndpoint);

// Recurring Appointments endpoints
router.post('/recurring/series', protect, createRecurringSeries);
router.get('/recurring/series', protect, getRecurringSeries);
router.post('/recurring/series/:seriesId/pause', protect, pauseRecurringSeries);
router.post('/recurring/series/:seriesId/resume', protect, resumeRecurringSeries);
router.post('/recurring/series/:seriesId/cancel', protect, cancelRecurringSeries);

// Waiting List endpoints
router.get('/waiting-list/location/:providerId/:branchCode/:queueDate', ...viewAppointments, getWaitingListForLocation);
router.post('/:id/waiting-list/confirm', protect, confirmWaitingListSlot);
router.post('/:id/waiting-list/cancel', protect, cancelWaitingListSlot);

export default router;

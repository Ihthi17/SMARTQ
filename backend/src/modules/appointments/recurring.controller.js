import {
  createRecurringSeries as createRecurringSeriesService, 
  pauseRecurringSeries as pauseRecurringSeriesService, 
  resumeRecurringSeries as resumeRecurringSeriesService,
  cancelRecurringSeries as cancelRecurringSeriesService, 
  getUserRecurringSeries,
} from './recurring.service.js';
import mongoose from 'mongoose';
import { writeAuditLog } from '../settings/audit.service.js';

const validateObjectId = (id) => mongoose.isValidObjectId(id);

/**
 * Create a new recurring appointment series
 * POST /api/appointments/recurring/series
 */
export const createRecurringSeries = async (req, res, next) => {
  try {
    const {
      providerId, branchCode, serviceCode,
      customerName, customerEmail, customerPhone,
      recurrenceType, startDate, endDate, maxOccurrences,
      daysOfWeek, dayOfMonth, timeOfDay,
      bookingType = 'in_person', priority = 'normal', notes, intakeData = {},
    } = req.body;

    // Validate required fields
    if (!providerId || !validateObjectId(providerId)) {
      return res.status(400).json({ message: 'Valid providerId is required.' });
    }
    if (!serviceCode || typeof serviceCode !== 'string' || !serviceCode.trim()) {
      return res.status(400).json({ message: 'Service code is required.' });
    }
    if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
      return res.status(400).json({ message: 'Customer name is required.' });
    }
    if (!customerEmail || typeof customerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ message: 'Valid customer email is required.' });
    }
    if (!customerPhone || typeof customerPhone !== 'string' || !customerPhone.trim()) {
      return res.status(400).json({ message: 'Customer phone is required.' });
    }
    if (!startDate) {
      return res.status(400).json({ message: 'Start date is required.' });
    }
    if (!recurrenceType) {
      return res.status(400).json({ message: 'Recurrence type is required.' });
    }

    const series = await createRecurringSeriesService({
      userId: req.user.userId,
      providerId,
      branchCode: String(branchCode).toUpperCase(),
      serviceCode: String(serviceCode).toUpperCase(),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: customerPhone.trim(),
      recurrenceType,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      maxOccurrences: maxOccurrences ? Number(maxOccurrences) : null,
      daysOfWeek: daysOfWeek || [],
      dayOfMonth: dayOfMonth ? Number(dayOfMonth) : null,
      timeOfDay,
      bookingType,
      priority,
      notes,
      intakeData,
    });

    await writeAuditLog(req, {
      action: 'recurring.series.created',
      resource: 'recurring_series',
      resourceId: series._id,
      details: { recurrenceType, startDate, endDate, maxOccurrences },
    });

    return res.status(201).json(series);
  } catch (error) {
    next(error);
  }
};

/**
 * Get recurring series for user
 * GET /api/appointments/recurring/series
 */
export const getRecurringSeries = async (req, res, next) => {
  try {
    const { status = 'active', page = 1, limit = 10 } = req.query;

    const result = await getUserRecurringSeries(req.user.userId, {
      status,
      page: Number(page),
      limit: Number(limit),
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Pause a recurring series
 * POST /api/appointments/recurring/series/:seriesId/pause
 */
export const pauseRecurringSeries = async (req, res, next) => {
  try {
    const { seriesId } = req.params;

    if (!validateObjectId(seriesId)) {
      return res.status(400).json({ message: 'Invalid series ID.' });
    }

    const series = await pauseRecurringSeriesService(seriesId);

    await writeAuditLog(req, {
      action: 'recurring.series.paused',
      resource: 'recurring_series',
      resourceId: series._id,
    });

    return res.json(series);
  } catch (error) {
    next(error);
  }
};

/**
 * Resume a paused recurring series
 * POST /api/appointments/recurring/series/:seriesId/resume
 */
export const resumeRecurringSeries = async (req, res, next) => {
  try {
    const { seriesId } = req.params;

    if (!validateObjectId(seriesId)) {
      return res.status(400).json({ message: 'Invalid series ID.' });
    }

    const series = await resumeRecurringSeriesService(seriesId);

    await writeAuditLog(req, {
      action: 'recurring.series.resumed',
      resource: 'recurring_series',
      resourceId: series._id,
    });

    return res.json(series);
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel a recurring series
 * POST /api/appointments/recurring/series/:seriesId/cancel
 */
export const cancelRecurringSeries = async (req, res, next) => {
  try {
    const { seriesId } = req.params;
    const { cancelFutureAppointments = true, reason = '' } = req.body;

    if (!validateObjectId(seriesId)) {
      return res.status(400).json({ message: 'Invalid series ID.' });
    }

    const series = await cancelRecurringSeriesService(seriesId, cancelFutureAppointments, reason);

    await writeAuditLog(req, {
      action: 'recurring.series.cancelled',
      resource: 'recurring_series',
      resourceId: series._id,
      details: { reason, cancelFutureAppointments },
    });

    return res.json(series);
  } catch (error) {
    next(error);
  }
};

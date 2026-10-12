import {
  getWaitingList as getWaitingListService, 
  confirmWaitingListSlot as confirmWaitingListSlotService, 
  cancelWaitingListEntry as cancelWaitingListEntryService,
} from './waiting-list.service.js';
import mongoose from 'mongoose';
import { Appointment } from './appointment.model.js';
import { writeAuditLog } from '../settings/audit.service.js';

const validateObjectId = (id) => mongoose.isValidObjectId(id);

/**
 * Get waiting list for a specific location and date
 * GET /api/appointments/waiting-list/location/:providerId/:branchCode/:queueDate
 */
export const getWaitingListForLocation = async (req, res, next) => {
  try {
    const { providerId, branchCode, queueDate } = req.params;

    if (!validateObjectId(providerId)) {
      return res.status(400).json({ message: 'Invalid provider ID.' });
    }

    if (!branchCode || typeof branchCode !== 'string') {
      return res.status(400).json({ message: 'Branch code is required.' });
    }

    const date = new Date(queueDate);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid queue date.' });
    }

    // Normalize to start of day UTC
    const normalizedDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    const waitingList = await getWaitingListService(providerId, branchCode.toUpperCase(), normalizedDate);

    return res.json(waitingList);
  } catch (error) {
    next(error);
  }
};

/**
 * Customer confirms waiting list slot
 * POST /api/appointments/:id/waiting-list/confirm
 */
export const confirmWaitingListSlot = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;

    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }

    // Verify appointment belongs to user
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    if (appointment.userId && String(appointment.userId) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'You do not have permission to confirm this appointment.' });
    }

    const waitingEntry = await confirmWaitingListSlotService(appointmentId);

    await writeAuditLog(req, {
      action: 'waiting_list.confirmed',
      resource: 'appointment',
      resourceId: appointmentId,
      details: { position: waitingEntry.position },
    });

    return res.json({
      message: 'Waiting list slot confirmed. You are now queued for this appointment.',
      appointment: appointment.toObject(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel waiting list entry
 * POST /api/appointments/:id/waiting-list/cancel
 */
export const cancelWaitingListSlot = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;
    const { reason = '' } = req.body;

    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }

    // Verify appointment belongs to user
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    if (appointment.userId && String(appointment.userId) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'You do not have permission to cancel this appointment.' });
    }

    const waitingEntry = await cancelWaitingListEntryService(appointmentId, reason);

    if (!waitingEntry) {
      return res.status(404).json({ message: 'Appointment is not on waiting list.' });
    }

    await writeAuditLog(req, {
      action: 'waiting_list.cancelled',
      resource: 'appointment',
      resourceId: appointmentId,
      details: { reason },
    });

    return res.json({
      message: 'Waiting list entry cancelled.',
      appointment: appointment.toObject(),
    });
  } catch (error) {
    next(error);
  }
};

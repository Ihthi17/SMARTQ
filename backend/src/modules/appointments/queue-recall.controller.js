import {
  callCustomer, recallCustomer, markCustomerCheckedIn, getCallStatusHistory,
  resetCallStatus, getMaxRecallAttempts,
} from './queue-recall.service.js';
import { Appointment } from './appointment.model.js';
import mongoose from 'mongoose';
import { writeAuditLog } from '../settings/audit.service.js';

const validateObjectId = (id) => mongoose.isValidObjectId(id);

/**
 * Call a customer for their appointment
 * POST /api/appointments/:id/call
 */
export const callCustomerEndpoint = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;

    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }

    const appointment = await callCustomer(appointmentId);

    await writeAuditLog(req, {
      action: 'appointment.customer_called',
      resource: 'appointment',
      resourceId: appointmentId,
      details: { customerName: appointment.customerName, callStatus: appointment.callStatus },
    });

    return res.json({
      message: 'Customer called. Notification sent.',
      appointment: { _id: appointment._id, callStatus: appointment.callStatus, calledAt: appointment.calledAt },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recall (remind) a customer
 * POST /api/appointments/:id/recall
 */
export const recallCustomerEndpoint = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;
    const { method = 'sms' } = req.body;

    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }

    if (!['sms', 'email', 'whatsapp', 'call'].includes(method)) {
      return res.status(400).json({ message: 'Invalid recall method. Must be: sms, email, whatsapp, or call.' });
    }

    const { appointment, deliveryStatus } = await recallCustomer(appointmentId, method);

    await writeAuditLog(req, {
      action: 'appointment.customer_recalled',
      resource: 'appointment',
      resourceId: appointmentId,
      details: { method, deliveryStatus, recallCount: appointment.recallCount },
    });

    return res.json({
      message: `Recall notification sent via ${method}.`,
      appointment: {
        _id: appointment._id,
        callStatus: appointment.callStatus,
        recallCount: appointment.recallCount,
        lastRecalledAt: appointment.lastRecalledAt,
        nextAutoRecallAt: appointment.nextAutoRecallAt,
      },
      deliveryStatus,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark customer as checked in (stops recalls)
 * POST /api/appointments/:id/checked-in
 */
export const markCheckedInEndpoint = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;

    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }

    const appointment = await markCustomerCheckedIn(appointmentId);

    await writeAuditLog(req, {
      action: 'appointment.checked_in_call_ended',
      resource: 'appointment',
      resourceId: appointmentId,
      details: { callStatus: appointment.callStatus },
    });

    return res.json({
      message: 'Customer marked as checked in. Auto-recalls stopped.',
      appointment: { _id: appointment._id, callStatus: appointment.callStatus },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get call status history for an appointment
 * GET /api/appointments/:id/call-status
 */
export const getCallStatusHistoryEndpoint = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;

    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }

    const history = await getCallStatusHistory(appointmentId);

    return res.json(history);
  } catch (error) {
    next(error);
  }
};

/**
 * Reset call status for a queue session (used when closing and reopening queue)
 * POST /api/queue/:providerId/:branchCode/:queueDate/reset-call-status
 */
export const resetCallStatusEndpoint = async (req, res, next) => {
  try {
    const { providerId, branchCode, queueDate } = req.params;

    if (!validateObjectId(providerId)) {
      return res.status(400).json({ message: 'Invalid provider ID.' });
    }

    const date = new Date(queueDate);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid queue date.' });
    }

    // Normalize to start of day UTC
    const normalizedDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    const modifiedCount = await resetCallStatus(providerId, branchCode.toUpperCase(), normalizedDate);

    await writeAuditLog(req, {
      action: 'queue.call_status_reset',
      resource: 'queue_session',
      details: { providerId, branchCode, queueDate: normalizedDate, modifiedCount },
    });

    return res.json({
      message: `Call status reset for ${modifiedCount} appointments.`,
      modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get queue recall settings
 * GET /api/appointments/queue-recall/settings
 */
export const getQueueRecallSettingsEndpoint = async (req, res, next) => {
  try {
    const maxAttempts = await getMaxRecallAttempts();

    return res.json({
      maxAttempts,
      enabledMethods: ['sms', 'email', 'whatsapp', 'call'],
    });
  } catch (error) {
    next(error);
  }
};

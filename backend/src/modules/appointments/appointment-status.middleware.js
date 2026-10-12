import { Setting } from '../settings/setting.model.js';

/**
 * Middleware to validate appointment status against configured statuses
 */
export const validateAppointmentStatus = async (req, res, next) => {
  try {
    const { status } = req.body || {};

    if (!status) {
      return next(); // Status not being updated
    }

    // Get configured appointment statuses
    const statusConfig = await Setting.get('appointment_status_configuration', 'pending\nconfirmed\nqueued\ncalled\nin_service\ncompleted\ncancelled\nexpired\nno_show');
    const allowedStatuses = String(statusConfig)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid appointment status. Allowed statuses: ${allowedStatuses.join(', ')}`,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to check if a status transition is valid
 */
export const isValidStatusTransition = (fromStatus, toStatus) => {
  const validTransitions = {
    pending: ['confirmed', 'cancelled', 'expired'],
    confirmed: ['queued', 'cancelled', 'expired'],
    queued: ['called', 'completed', 'cancelled', 'no_show'],
    called: ['in_service', 'cancelled', 'no_show'],
    in_service: ['completed', 'cancelled'],
    completed: [], // Terminal state
    cancelled: [], // Terminal state
    expired: [], // Terminal state
    no_show: [], // Terminal state
  };

  return validTransitions[fromStatus]?.includes(toStatus) || false;
};

/**
 * Strict status transition validation
 */
export const validateStatusTransition = async (req, res, next) => {
  try {
    const { status: newStatus } = req.body || {};

    if (!newStatus) {
      return next(); // Status not being updated
    }

    const appointmentId = req.params.id;
    if (!appointmentId) {
      return next();
    }

    // This should be called after appointment is loaded in the controller
    // For now, we'll just validate the status format
    const statusConfig = await Setting.get('appointment_status_configuration', 'pending\nconfirmed\nqueued\ncalled\nin_service\ncompleted\ncancelled\nexpired\nno_show');
    const allowedStatuses = String(statusConfig)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({
        message: `Invalid appointment status '${newStatus}'. Allowed statuses: ${allowedStatuses.join(', ')}`,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

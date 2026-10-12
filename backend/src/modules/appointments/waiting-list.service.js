import { WaitingList } from './waiting-list.model.js';
import { Appointment } from './appointment.model.js';
import { Setting } from '../settings/setting.model.js';
import { sendEmail } from '../notifications/email.service.js';
import { sendSms, sendWhatsApp } from '../notifications/sms.service.js';
import { Notification } from '../notifications/notification.model.js';

/**
 * Add appointment to waiting list when limits are reached
 */
export const addToWaitingList = async (appointment) => {
  // Get waiting list setting
  const waitingListEnabled = (await Setting.get('appointment_waiting_list', true)) === true;
  if (!waitingListEnabled) {
    throw new Error('Waiting list is disabled. Cannot create appointment at this time.');
  }

  // Get current position in waiting list
  const position = (await WaitingList.countDocuments({
    providerId: appointment.providerId,
    queueDate: appointment.queueDate,
    status: { $in: ['waiting', 'notified'] },
  })) + 1;

  // Get waiting list expiration setting (default 24 hours)
  const expirationHours = Number(await Setting.get('waiting_list_expiration_hours', 24)) || 24;
  const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

  // Create waiting list entry
  const waitingEntry = await WaitingList.create({
    appointmentId: appointment._id,
    providerId: appointment.providerId,
    branchCode: appointment.branchCode,
    serviceCode: appointment.serviceCode,
    queueDate: appointment.queueDate,
    customerName: appointment.customerName,
    customerEmail: appointment.customerEmail,
    customerPhone: appointment.customerPhone,
    position,
    status: 'waiting',
    expiresAt,
    priority: appointment.priority,
    notes: appointment.notes,
  });

  // Update appointment to mark it as on waiting list
  appointment.status = 'waiting';
  appointment.waitingListPosition = position;
  appointment.waitingListExpiresAt = expiresAt;
  await appointment.save();

  // Send notification to customer
  await notifyWaitingListCustomer(appointment, 'added', position);

  return waitingEntry;
};

/**
 * Notify waiting list customer
 */
export const notifyWaitingListCustomer = async (appointment, action, position) => {
  const message = action === 'added'
    ? `You have been added to the waiting list at position ${position}. We will notify you when a slot becomes available.`
    : action === 'slot_available'
    ? `Good news! A slot is now available for your appointment. Please confirm within 30 minutes.`
    : `Your waiting list entry has expired. Please book a new appointment.`;

  const subject = action === 'added'
    ? 'Added to Waiting List'
    : action === 'slot_available'
    ? 'Slot Available - Confirm Now'
    : 'Waiting List Entry Expired';

  const notificationDelivery = {};

  // Email notification
  if (appointment.customerEmail) {
    try {
      await sendEmail({
        to: appointment.customerEmail,
        subject: `SmartQ - ${subject}`,
        text: message,
        html: `<p>${message}</p>`,
      });
      notificationDelivery.email = 'sent';
    } catch (error) {
      console.error(`Waiting list email failed for ${appointment._id}:`, error);
      notificationDelivery.email = 'failed';
      notificationDelivery.emailError = error.message;
    }
  }

  // SMS notification
  if (appointment.customerPhone && (await Setting.get('sms_enabled', false)) === true) {
    try {
      await sendSms({
        to: appointment.customerPhone,
        message,
      });
      notificationDelivery.sms = 'sent';
    } catch (error) {
      console.error(`Waiting list SMS failed for ${appointment._id}:`, error);
      notificationDelivery.sms = 'failed';
    }
  }

  // WhatsApp notification
  if (appointment.customerPhone && (await Setting.get('whatsapp_enabled', false)) === true) {
    try {
      await sendWhatsApp({
        to: appointment.customerPhone,
        message,
      });
      notificationDelivery.whatsapp = 'sent';
    } catch (error) {
      console.error(`Waiting list WhatsApp failed for ${appointment._id}:`, error);
      notificationDelivery.whatsapp = 'failed';
    }
  }

  return notificationDelivery;
};

/**
 * Check if a slot is available and convert first waiting list customer to confirmed
 */
export const promoteFromWaitingList = async (providerId, branchCode, queueDate, serviceCode) => {
  // Find first waiting customer
  const waitingEntry = await WaitingList.findOne({
    providerId,
    branchCode,
    queueDate,
    status: 'waiting',
  }).sort({ position: 1 });

  if (!waitingEntry) {
    return null; // No one waiting
  }

  const appointment = await Appointment.findById(waitingEntry.appointmentId);
  if (!appointment) {
    await waitingEntry.deleteOne();
    return null;
  }

  // Get confirmation deadline setting (default 30 minutes)
  const confirmationMinutes = Number(await Setting.get('waiting_list_confirmation_deadline_minutes', 30)) || 30;
  const confirmationDeadline = new Date(Date.now() + confirmationMinutes * 60 * 1000);

  // Update waiting list entry
  waitingEntry.status = 'notified';
  waitingEntry.slotBecameAvailableAt = new Date();
  waitingEntry.notificationSentAt = new Date();
  waitingEntry.confirmationDeadline = confirmationDeadline;
  await waitingEntry.save();

  // Update appointment
  appointment.waitingListNotifiedAt = new Date();
  await appointment.save();

  // Notify customer of available slot
  await notifyWaitingListCustomer(appointment, 'slot_available', waitingEntry.position);

  // Re-order waiting list positions
  await reorderWaitingListPositions(providerId, queueDate);

  return waitingEntry;
};

/**
 * Customer confirms they want the available slot
 */
export const confirmWaitingListSlot = async (appointmentId) => {
  const waitingEntry = await WaitingList.findOne({
    appointmentId,
    status: 'notified',
  });

  if (!waitingEntry) {
    throw new Error('Appointment is not on waiting list or not ready to confirm.');
  }

  if (new Date() > waitingEntry.confirmationDeadline) {
    // Deadline passed, move to next in line
    waitingEntry.status = 'expired';
    waitingEntry.reason = 'Confirmation deadline passed';
    await waitingEntry.save();

    // Notify customer
    const appointment = await Appointment.findById(appointmentId);
    if (appointment) {
      await notifyWaitingListCustomer(appointment, 'expired', null);
    }

    // Try to promote next in line
    await promoteFromWaitingList(waitingEntry.providerId, waitingEntry.branchCode, waitingEntry.queueDate);

    throw new Error('Confirmation deadline has passed. Please book a new appointment.');
  }

  // Move to confirmed status
  waitingEntry.status = 'confirmed';
  waitingEntry.confirmedAt = new Date();
  await waitingEntry.save();

  // Update appointment status from waiting to pending/confirmed
  const appointment = await Appointment.findById(appointmentId);
  if (appointment) {
    appointment.status = 'confirmed';
    appointment.waitingListPosition = null;
    await appointment.save();
  }

  // Promote next in line
  await promoteFromWaitingList(waitingEntry.providerId, waitingEntry.branchCode, waitingEntry.queueDate);

  return waitingEntry;
};

/**
 * Reorder waiting list positions after confirmation
 */
export const reorderWaitingListPositions = async (providerId, queueDate) => {
  const waitingEntries = await WaitingList.find({
    providerId,
    queueDate,
    status: { $in: ['waiting', 'notified'] },
  }).sort({ createdAt: 1 });

  for (let i = 0; i < waitingEntries.length; i++) {
    waitingEntries[i].position = i + 1;
    await waitingEntries[i].save();
  }
};

/**
 * Cancel waiting list entry
 */
export const cancelWaitingListEntry = async (appointmentId, reason = '') => {
  const waitingEntry = await WaitingList.findOne({
    appointmentId,
    status: { $in: ['waiting', 'notified'] },
  });

  if (!waitingEntry) {
    return null; // Not on waiting list
  }

  waitingEntry.status = 'cancelled';
  waitingEntry.reason = reason;
  await waitingEntry.save();

  // Update appointment
  const appointment = await Appointment.findById(appointmentId);
  if (appointment) {
    appointment.status = 'cancelled';
    appointment.waitingListPosition = null;
    await appointment.save();
  }

  // Reorder and promote next in line
  await reorderWaitingListPositions(waitingEntry.providerId, waitingEntry.queueDate);
  await promoteFromWaitingList(waitingEntry.providerId, waitingEntry.branchCode, waitingEntry.queueDate);

  return waitingEntry;
};

/**
 * Get waiting list for a location/date
 */
export const getWaitingList = async (providerId, branchCode, queueDate) => {
  const waitingList = await WaitingList.find({
    providerId,
    branchCode,
    queueDate,
    status: { $in: ['waiting', 'notified'] },
  })
    .populate('appointmentId', 'customerName customerEmail customerPhone priority scheduledStart notes')
    .sort({ position: 1 })
    .lean();

  return waitingList;
};

/**
 * Cleanup expired waiting list entries (scheduler job)
 */
export const cleanupExpiredWaitingList = async () => {
  const now = new Date();

  const expired = await WaitingList.updateMany(
    {
      status: 'waiting',
      expiresAt: { $lt: now },
    },
    {
      $set: {
        status: 'expired',
        reason: 'Waiting list entry expired',
      },
    },
  );

  // Also clean up confirmations that missed deadline
  const missedDeadline = await WaitingList.updateMany(
    {
      status: 'notified',
      confirmationDeadline: { $lt: now },
    },
    {
      $set: {
        status: 'expired',
        reason: 'Confirmation deadline passed',
      },
    },
  );

  return { expiredCount: expired.modifiedCount, missedDeadlineCount: missedDeadline.modifiedCount };
};

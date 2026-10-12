import { Appointment } from './appointment.model.js';
import { Setting } from '../settings/setting.model.js';
import { sendEmail } from '../notifications/email.service.js';
import { sendSms, sendWhatsApp } from '../notifications/sms.service.js';
import { Notification } from '../notifications/notification.model.js';

/**
 * Call a customer for their appointment
 */
export const callCustomer = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new Error('Appointment not found.');
  }

  if (appointment.callStatus === 'not_called') {
    appointment.callStatus = 'called';
    appointment.calledAt = new Date();
    appointment.nextAutoRecallAt = new Date(Date.now() + (await getAutoRecallMinutes()) * 60 * 1000);
  } else if (appointment.callStatus !== 'called') {
    throw new Error('Appointment is not in called state.');
  }

  await appointment.save();

  // Notify customer they are being called
  await notifyCustomerCalled(appointment, false); // false = first call, not recall

  return appointment;
};

/**
 * Recall (remind) a customer after they were called
 */
export const recallCustomer = async (appointmentId, method = 'sms') => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new Error('Appointment not found.');
  }

  // Check if recall is enabled
  const recallEnabled = (await Setting.get('queue_recall_enabled', true)) === true;
  if (!recallEnabled) {
    throw new Error('Queue recall is disabled.');
  }

  // Check max recall attempts
  const maxAttempts = Number(await Setting.get('queue_recall_attempts', 3)) || 3;
  if (appointment.recallCount >= maxAttempts) {
    appointment.callStatus = 'no_response';
    await appointment.save();
    throw new Error(`Maximum recall attempts (${maxAttempts}) reached.`);
  }

  // Validate method
  if (!['sms', 'email', 'whatsapp', 'call'].includes(method)) {
    throw new Error('Invalid recall method. Must be: sms, email, whatsapp, or call.');
  }

  // Validate customer contact info
  if (method === 'sms' && !appointment.customerPhone) {
    throw new Error('Customer phone number not available for SMS recall.');
  }
  if (method === 'email' && !appointment.customerEmail) {
    throw new Error('Customer email not available for email recall.');
  }
  if (method === 'whatsapp' && !appointment.customerPhone) {
    throw new Error('Customer phone number not available for WhatsApp recall.');
  }

  // Send recall notification
  const deliveryStatus = await sendRecallNotification(appointment, method);

  if (deliveryStatus !== 'failed') {
    // Record recall attempt
    appointment.recallCount += 1;
    appointment.lastRecalledAt = new Date();
    appointment.nextAutoRecallAt = new Date(Date.now() + (await getAutoRecallMinutes()) * 60 * 1000);

    if (!appointment.recallAttempts) {
      appointment.recallAttempts = [];
    }

    appointment.recallAttempts.push({
      attemptNumber: appointment.recallCount,
      recalledAt: new Date(),
      method,
      status: deliveryStatus === 'sent' ? 'sent' : 'failed',
    });

    // If all attempts exhausted, mark as no_response
    if (appointment.recallCount >= maxAttempts) {
      appointment.callStatus = 'no_response';
    }

    await appointment.save();
  }

  return { appointment, deliveryStatus };
};

/**
 * Send recall notification to customer
 */
export const sendRecallNotification = async (appointment, method = 'sms') => {
  const message = `Your number is being called at ${appointment.customerName}. Please proceed to counter now. Reference: ${appointment._id}`;
  const emailSubject = 'Your Queue Number Is Being Called';
  const emailHtml = `<p>Hello ${appointment.customerName},</p><p>Your queue number is now being called. Please proceed to the counter immediately.</p><p>Reference: ${appointment._id}</p>`;

  try {
    if (method === 'sms' && appointment.customerPhone && (await Setting.get('sms_enabled', false)) === true) {
      await sendSms({
        to: appointment.customerPhone,
        message,
      });
      return 'sent';
    } else if (method === 'email' && appointment.customerEmail) {
      await sendEmail({
        to: appointment.customerEmail,
        subject: emailSubject,
        text: message,
        html: emailHtml,
      });
      return 'sent';
    } else if (method === 'whatsapp' && appointment.customerPhone && (await Setting.get('whatsapp_enabled', false)) === true) {
      await sendWhatsApp({
        to: appointment.customerPhone,
        message,
      });
      return 'sent';
    } else {
      return 'failed'; // Method not available or service disabled
    }
  } catch (error) {
    console.error(`Recall notification via ${method} failed for ${appointment._id}:`, error);
    return 'failed';
  }
};

/**
 * Notify customer they are being called (for queue display)
 */
export const notifyCustomerCalled = async (appointment, isRecall = false) => {
  const message = isRecall
    ? `Reminder: Your queue number is being called. Please proceed to counter.`
    : `Your queue number is now being called. Please proceed to counter.`;

  const notificationDelivery = {};

  // SMS notification
  if (appointment.customerPhone && (await Setting.get('sms_enabled', false)) === true) {
    try {
      await sendSms({
        to: appointment.customerPhone,
        message,
      });
      notificationDelivery.sms = 'sent';
    } catch (error) {
      console.error(`Call notification SMS failed for ${appointment._id}:`, error);
      notificationDelivery.sms = 'failed';
    }
  }

  // Email notification
  if (appointment.customerEmail) {
    try {
      await sendEmail({
        to: appointment.customerEmail,
        subject: 'Your Queue Number Is Being Called',
        text: message,
        html: `<p>${message}</p>`,
      });
      notificationDelivery.email = 'sent';
    } catch (error) {
      console.error(`Call notification email failed for ${appointment._id}:`, error);
      notificationDelivery.email = 'failed';
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
      console.error(`Call notification WhatsApp failed for ${appointment._id}:`, error);
      notificationDelivery.whatsapp = 'failed';
    }
  }

  return notificationDelivery;
};

/**
 * Mark customer as checked in (no more recalls needed)
 */
export const markCustomerCheckedIn = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new Error('Appointment not found.');
  }

  appointment.callStatus = 'checked_in';
  appointment.nextAutoRecallAt = null;
  await appointment.save();

  return appointment;
};

/**
 * Get auto recall interval in minutes
 */
export const getAutoRecallMinutes = async () => {
  return Number(await Setting.get('queue_auto_recall_after_minutes', 2)) || 2;
};

/**
 * Auto-recall scheduler job (should be run every minute)
 */
export const processAutoRecalls = async () => {
  const now = new Date();

  // Find appointments that need auto-recall
  const appointmentsToRecall = await Appointment.find({
    callStatus: 'called',
    nextAutoRecallAt: { $lte: now },
    status: { $in: ['called', 'in_service'] },
    recallCount: { $lt: await getMaxRecallAttempts() },
  });

  let recalledCount = 0;

  for (const appointment of appointmentsToRecall) {
    try {
      // Default to SMS, fall back to email
      const method = appointment.customerPhone ? 'sms' : 'email';
      await recallCustomer(appointment._id, method);
      recalledCount += 1;
    } catch (error) {
      console.error(`Auto-recall failed for appointment ${appointment._id}:`, error.message);
    }
  }

  return { processedCount: appointmentsToRecall.length, recalledCount };
};

/**
 * Get max recall attempts
 */
export const getMaxRecallAttempts = async () => {
  return Number(await Setting.get('queue_recall_attempts', 3)) || 3;
};

/**
 * Get call status history for an appointment
 */
export const getCallStatusHistory = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new Error('Appointment not found.');
  }

  return {
    callStatus: appointment.callStatus,
    calledAt: appointment.calledAt,
    recallCount: appointment.recallCount,
    lastRecalledAt: appointment.lastRecalledAt,
    nextAutoRecallAt: appointment.nextAutoRecallAt,
    recallAttempts: appointment.recallAttempts || [],
  };
};

/**
 * Reset call status for new queue session
 */
export const resetCallStatus = async (providerId, branchCode, queueDate) => {
  const result = await Appointment.updateMany(
    {
      providerId,
      branchCode,
      queueDate,
      status: { $in: ['called', 'in_service'] },
    },
    {
      $set: {
        callStatus: 'not_called',
        calledAt: null,
        recallCount: 0,
        lastRecalledAt: null,
        nextAutoRecallAt: null,
        recallAttempts: [],
      },
    },
  );

  return result.modifiedCount;
};

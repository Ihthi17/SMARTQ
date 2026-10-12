import crypto from 'node:crypto';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { Appointment } from './appointment.model.js';
import { Provider } from '../providers/provider.model.js';
import { Service as ServiceCatalog } from '../providers/service.model.js';
import { User } from '../users/user.model.js';
import { QueueSession } from '../queue/queueSession.model.js';
import { Setting } from '../settings/setting.model.js';
import { sendEmail } from '../notifications/email.service.js';
import { sendSms, sendWhatsApp } from '../notifications/sms.service.js';
import { Notification } from '../notifications/notification.model.js';
import { enforceCustomerAppointmentLimit, enforceDailyAppointmentLimit } from './appointment-limits.service.js';
import { addToWaitingList } from './waiting-list.service.js';
import { isValidAppointmentFileId } from './appointment-upload.js';

const startOfDay = (value) => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const issueAppointmentQrToken = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const allocateToken = async ({ providerId, queueDate, branchCode, averageServiceMinutes, queueStatus }) => {
  const scope = { providerId, queueDate };
  try {
    // Get the current queue session
    let session = await QueueSession.findOne(scope);
    
    if (!session) {
      // Create new session if it doesn't exist
      session = await QueueSession.create({
        ...scope,
        branchCode,
        averageServiceMinutes,
        status: queueStatus,
        queueLength: 1,
      });
      return { session, tokenNumber: 1 };
    }
    
    // Instead of just incrementing, count actual confirmed/queued appointments to get accurate token number
    const confirmedCount = await Appointment.countDocuments({
      providerId,
      queueDate: session.queueDate,
      status: { $in: ['confirmed', 'queued', 'called', 'in_service', 'completed'] },
      tokenNumber: { $gt: 0 },
    });
    
    // Next token number is the count + 1
    const nextTokenNumber = confirmedCount + 1;
    
    // Update session with accurate queue length
    session.queueLength = nextTokenNumber;
    session.branchCode = branchCode;
    session.averageServiceMinutes = averageServiceMinutes;
    await session.save();
    
    return { session, tokenNumber: nextTokenNumber };
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Duplicate key error - retry with correct count
    const session = await QueueSession.findOne(scope);
    if (!session) throw error;
    
    const confirmedCount = await Appointment.countDocuments({
      providerId,
      queueDate: session.queueDate,
      status: { $in: ['confirmed', 'queued', 'called', 'in_service', 'completed'] },
      tokenNumber: { $gt: 0 },
    });
    
    const nextTokenNumber = confirmedCount + 1;
    session.queueLength = nextTokenNumber;
    session.branchCode = branchCode;
    session.averageServiceMinutes = averageServiceMinutes;
    await session.save();
    
    return { session, tokenNumber: nextTokenNumber };
  }
};

export const createAppointment = async ({
  providerId, serviceCode, scheduledStart, branchCode, customerName,
  customerEmail, customerPhone, bookingType = 'in_person', notes, intakeData = {}, uploadedFiles = [],
  assignedStaffId, createdVia = 'online', priority = 'normal', userId, onAppointmentSaved,
}) => {
  if (!mongoose.isValidObjectId(providerId)) {
    const service = await ServiceCatalog.findOne({
      code: String(serviceCode || '').trim().toUpperCase(),
      isActive: true,
    }).select('providerId').lean();
    if (service?.providerId) providerId = service.providerId;
  }
  if (!mongoose.isValidObjectId(providerId)) {
    throw Object.assign(new Error('A valid location/service provider is required.'), { statusCode: 400 });
  }
  // For services that require date/time, validate it; otherwise use current time as placeholder.
  // `hasScheduledTime` tracks whether the customer actually chose a time — walk-in /
  // flexible services skip the holiday and working-hours validations below.
  let start;
  const hasScheduledTime = scheduledStart !== undefined && scheduledStart !== null && scheduledStart !== '';
  if (hasScheduledTime) {
    start = new Date(scheduledStart);
    if (Number.isNaN(start.getTime()) || start <= new Date()) {
      throw Object.assign(new Error('Appointment time must be a valid future date.'), { statusCode: 400 });
    }
  } else {
    // No date/time required (walk-in): use current time as the queue placeholder
    start = new Date();
  }
  const provider = await Provider.findOne({ _id: providerId, isActive: true });
  if (!provider) throw Object.assign(new Error('Location or service is not available.'), { statusCode: 404 });
  let assignedStaff;
  if (assignedStaffId) {
    if (!mongoose.isValidObjectId(assignedStaffId)) throw Object.assign(new Error('Invalid assigned staff member.'), { statusCode: 400 });
    assignedStaff = await User.findOne({ _id: assignedStaffId, role: 'staff', status: 'ACTIVE' }).select('_id');
    if (!assignedStaff) throw Object.assign(new Error('Choose an active staff account.'), { statusCode: 400 });
    if (provider.staffIds?.length && !provider.staffIds.some((id) => String(id) === String(assignedStaff._id))) {
      throw Object.assign(new Error('This staff member is not assigned to the selected location.'), { statusCode: 400 });
    }
  }

  const normalizedServiceCode = String(serviceCode).trim().toUpperCase();
  const [catalogService, inactiveCatalogService] = await Promise.all([
    ServiceCatalog.findOne({ code: normalizedServiceCode, isActive: true }).lean(),
    ServiceCatalog.exists({ code: normalizedServiceCode, isActive: false }),
  ]);
  const legacyService = provider.services.find((item) => item.toUpperCase() === normalizedServiceCode);
  if ((!catalogService && !legacyService) || inactiveCatalogService) {
    throw Object.assign(new Error('Selected service is not available at this location.'), { statusCode: 400 });
  }
  if (catalogService && !catalogService.channels.includes('appointments')) {
    throw Object.assign(new Error('Online appointments are not enabled for this service.'), { statusCode: 400 });
  }
  if (catalogService?.providerId && String(catalogService.providerId) !== String(providerId)) {
    throw Object.assign(new Error('Selected service is assigned to a different location.'), { statusCode: 400 });
  }
  const service = normalizedServiceCode;
  const requirements = catalogService?.requirements?.length
    ? catalogService.requirements
    : provider.serviceConfigurations?.find((configuration) => configuration.serviceCode === service)?.fields || [];
  if (!intakeData || typeof intakeData !== 'object' || Array.isArray(intakeData)) {
    throw Object.assign(new Error('Service requirement answers must be provided as a form object.'), { statusCode: 400 });
  }
  const allowedAnswers = new Set(requirements.map((field) => field.name));
  if (Object.keys(intakeData).some((key) => !allowedAnswers.has(key))) {
    throw Object.assign(new Error('The submitted form contains an unknown service requirement.'), { statusCode: 400 });
  }
  const uploadedFilesByField = new Map();
  for (const uploadedFile of uploadedFiles) {
    if (!uploadedFile || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(uploadedFile.fieldName) ||
        uploadedFilesByField.has(uploadedFile.fieldName)) {
      throw Object.assign(new Error('One or more service requirement files are invalid.'), { statusCode: 400 });
    }
    uploadedFilesByField.set(uploadedFile.fieldName, uploadedFile);
  }
  if ([...uploadedFilesByField.keys()].some(name => !allowedAnswers.has(name))) {
    throw Object.assign(new Error('The submitted form contains an unknown service requirement file.'), { statusCode: 400 });
  }
  const validatedIntakeData = {};
  for (const field of requirements) {
    const answer = intakeData[field.name];
    const uploadedFile = uploadedFilesByField.get(field.name);
    if (field.type === 'file') {
      if (answer !== undefined && answer !== null && answer !== '') {
        throw Object.assign(new Error(`${field.label} must be uploaded using the file field.`), { statusCode: 400 });
      }
      if (field.required && !uploadedFile) {
        throw Object.assign(new Error(`${field.label} is required.`), { statusCode: 400 });
      }
      if (uploadedFile) {
        if (!isValidAppointmentFileId(uploadedFile.fileId) ||
            typeof uploadedFile.originalName !== 'string' || !uploadedFile.originalName.trim() ||
            !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(uploadedFile.mimeType) ||
            !Number.isInteger(uploadedFile.size) || uploadedFile.size < 1 || uploadedFile.size > 5 * 1024 * 1024) {
          throw Object.assign(new Error(`${field.label} contains an invalid file.`), { statusCode: 400 });
        }
        validatedIntakeData[field.name] = {
          fileId: uploadedFile.fileId,
          originalName: uploadedFile.originalName,
          mimeType: uploadedFile.mimeType,
          size: uploadedFile.size,
        };
      }
      continue;
    }
    if (uploadedFile) {
      throw Object.assign(new Error(`${field.label} does not accept file uploads.`), { statusCode: 400 });
    }
    if (field.type === 'checkbox' && field.required && answer !== true) {
      throw Object.assign(new Error(`${field.label} must be checked.`), { statusCode: 400 });
    }
    if (field.required && (answer === undefined || answer === null || String(answer).trim() === '')) {
      throw Object.assign(new Error(`${field.label} is required.`), { statusCode: 400 });
    }
    if (answer === undefined || answer === null || answer === '') continue;
    const normalized = typeof answer === 'string' ? answer.trim() : answer;
    if (typeof normalized === 'string' && normalized.length > 2000) {
      throw Object.assign(new Error(`${field.label} is too long.`), { statusCode: 400 });
    }
    if (field.type === 'email' && (typeof normalized !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))) {
      throw Object.assign(new Error(`${field.label} must be a valid email address.`), { statusCode: 400 });
    }
    if (field.type === 'number' && !Number.isFinite(Number(normalized))) {
      throw Object.assign(new Error(`${field.label} must be a number.`), { statusCode: 400 });
    }
    if (field.type === 'select' && !field.options.includes(normalized)) {
      throw Object.assign(new Error(`Choose a valid option for ${field.label}.`), { statusCode: 400 });
    }
    if (field.type === 'checkbox' && typeof normalized !== 'boolean') {
      throw Object.assign(new Error(`${field.label} must be checked or unchecked.`), { statusCode: 400 });
    }
    validatedIntakeData[field.name] = normalized;
  }
  const locationCode = String(provider.branch?.code || provider.code).toUpperCase();
  if (branchCode && String(branchCode).toUpperCase() !== locationCode) {
    throw Object.assign(new Error('Selected location does not match this service provider.'), { statusCode: 400 });
  }

  const queueDate = startOfDay(start);
  await enforceDailyAppointmentLimit({ queueDate });
  if (typeof customerName !== 'string' || !customerName.trim() || customerName.length > 150) {
    throw Object.assign(new Error('Customer name is required and must be 150 characters or fewer.'), { statusCode: 400 });
  }
  if (customerEmail && (typeof customerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) {
    throw Object.assign(new Error('Enter a valid customer email address.'), { statusCode: 400 });
  }
  if (typeof customerPhone !== 'string' || !customerPhone.trim() || customerPhone.trim().length > 30) {
    throw Object.assign(new Error('A valid customer phone number is required.'), { statusCode: 400 });
  }
  if (notes && (typeof notes !== 'string' || notes.length > 2000)) {
    throw Object.assign(new Error('Appointment notes must be 2000 characters or fewer.'), { statusCode: 400 });
  }
  if (!['in_person', 'virtual'].includes(bookingType)) {
    throw Object.assign(new Error('Unsupported appointment type.'), { statusCode: 400 });
  }
  if (!customerEmail) {
    throw Object.assign(new Error('An email address is required to receive your appointment confirmation and check-in QR code.'), { statusCode: 400 });
  }
  const customerFilter = customerEmail
    ? { customerEmail: customerEmail.trim().toLowerCase() }
    : { customerPhone: customerPhone.trim() };

  // Try to enforce limits, but if waiting list is enabled, add to waiting list instead of throwing
  let limitExceeded = null;
  try {
    await enforceDailyAppointmentLimit({ queueDate });
  } catch (error) {
    limitExceeded = error;
  }

  if (!limitExceeded) {
    try {
      await enforceCustomerAppointmentLimit({ queueDate, customerEmail, customerPhone });
    } catch (error) {
      limitExceeded = error;
    }
  }

  if (limitExceeded) {
    const waitingListEnabled = (await Setting.get('appointment_waiting_list', true)) === true;
    if (!waitingListEnabled) {
      throw limitExceeded;
    }
    // Will add to waiting list after creating the appointment
  }

  const [appointmentDuration, bufferMinutes, configuredServiceDuration] = await Promise.all([
    Setting.get('appointment_duration_minutes', 30),
    Setting.get('appointment_buffer_minutes', 5),
    Setting.get('service_default_duration_minutes', 15),
  ]);
  
  // Calculate average service duration with proper fallback chain
  let serviceMinutes = catalogService?.durationMinutes ?? provider.avgServiceMinutes ?? configuredServiceDuration ?? 15;
  serviceMinutes = Number(serviceMinutes) || 15;
  const averageServiceMinutes = Math.max(1, serviceMinutes);
  const appointmentEnd = new Date(start.getTime() +
    (Math.max(1, Number(appointmentDuration) || 30) + Math.max(0, Number(bufferMinutes) || 0)) * 60 * 1000);
  if ((await Setting.get('appointment_double_booking', false)) !== true) {
    const overlapping = await Appointment.exists({
      providerId,
      queueDate,
      ...customerFilter,
      status: { $in: ['pending', 'queued', 'called', 'in_service'] },
      scheduledStart: { $lt: appointmentEnd },
      $or: [
        { scheduledEnd: { $gt: start } },
        { scheduledEnd: { $exists: false }, scheduledStart: { $gte: new Date(start.getTime() - 3 * 60 * 60 * 1000) } },
      ],
    });
    if (overlapping) {
      throw Object.assign(new Error('You already have an appointment at this location around that time.'), { statusCode: 409 });
    }
  }
  const timeZone = await Setting.get('timezone', 'Asia/Kolkata');
  if (hasScheduledTime && (await Setting.get('appointment_holiday_blocking', true)) === true) {
    const holidays = String(await Setting.get('appointment_holidays', ''))
      .split(/\r?\n/).map((date) => date.trim()).filter(Boolean);
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(start);
    const localDate = `${dateParts.find((part) => part.type === 'year')?.value}-${dateParts.find((part) => part.type === 'month')?.value}-${dateParts.find((part) => part.type === 'day')?.value}`;
    if (holidays.includes(localDate)) {
      throw Object.assign(new Error('Appointments are unavailable on this holiday.'), { statusCode: 409 });
    }
  }
  const workingHours = provider.workingHours || [];
  if (hasScheduledTime && (await Setting.get('appointment_provider_availability', true)) === true && workingHours.length) {
    const startParts = new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(start);
    const getPart = (parts, type) => parts.find((entry) => entry.type === type)?.value;
    const weekday = String(getPart(startParts, 'weekday')).toLowerCase();
    const startTime = `${getPart(startParts, 'hour')}:${getPart(startParts, 'minute')}`;
    const schedule = workingHours.find((hours) => hours.day === weekday);
    if (!schedule || !schedule.isOpen || startTime < schedule.start || startTime >= schedule.end) {
      throw Object.assign(new Error('Selected time is outside this provider’s working hours.'), { statusCode: 409 });
    }
    const endParts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(appointmentEnd);
    const endTime = `${getPart(endParts, 'hour')}:${getPart(endParts, 'minute')}`;
    if (endTime > schedule.end) {
      throw Object.assign(new Error('Appointment duration exceeds this provider’s working hours.'), { statusCode: 409 });
    }
  }
  // DO NOT allocate token during creation - will be done on confirmation (when admin confirms or customer checks in)
  // Create appointment WITHOUT token number
  const priorityScore = priority === 'emergency' ? 0 : priority === 'high' ? 50 : 100;
  
  // Determine if appointment should be in waiting list or normal pending
  let appointmentStatus = 'pending';
  if (limitExceeded) {
    appointmentStatus = 'waiting'; // Will be in waiting list
  }

  const appointment = await Appointment.create({
    userId,
    assignedStaffId: assignedStaff?._id,
    providerId,
    branchCode: locationCode,
    serviceCode: service.toUpperCase(),
    customerName: customerName.trim(),
    customerEmail: customerEmail?.trim().toLowerCase(),
    customerPhone: customerPhone?.trim(),
    queueDate,
    scheduledStart: start,
    hasScheduledTime,
    scheduledEnd: appointmentEnd,
    status: appointmentStatus,
    // tokenNumber will be set on confirmation
    // tokenLabel will be set on confirmation
    bookingType,
    createdVia,
    priority,
    priorityScore,
    notes,
    intakeData: validatedIntakeData,
    // qrTokenHash will be set on confirmation
    // estimatedWaitMinutes will be calculated on confirmation
  });
  onAppointmentSaved?.();

  // Add to waiting list if limit was exceeded
  if (limitExceeded) {
    try {
      await addToWaitingList(appointment);
    } catch (error) {
      console.error(`Failed to add appointment ${appointment._id} to waiting list:`, error);
      // Don't throw - appointment is created, just log the error
    }
  }

  // Send CREATION notification (reference number only, no token/QR)
  const notificationDelivery = {};
  const message = hasScheduledTime
    ? `Your appointment at ${provider.name} is booked for ${start.toLocaleString()}. Reference: ${appointment._id}`
    : `Your appointment at ${provider.name} is booked (walk-in / flexible time). Reference: ${appointment._id}`;
  if (appointment.customerEmail) {
    try {
      const result = await sendEmail({
        to: appointment.customerEmail,
        subject: 'Smart Queue — Appointment Created',
        html: `<p>Hello ${escapeHtml(appointment.customerName)},</p><p>Your appointment at ${escapeHtml(provider.name)} is booked for ${escapeHtml(start.toLocaleString())}.</p><p>Reference ID: ${escapeHtml(String(appointment._id))}</p><p>Admin will confirm your appointment and assign you a queue token.</p>`,
        text: message,
      });
      notificationDelivery.email = result.mocked ? 'mocked' : 'sent';
    } catch (error) {
      console.error(`Appointment creation email failed for ${appointment._id}:`, error);
      notificationDelivery.email = 'failed';
      notificationDelivery.emailError = error.message;
    }
  }
  if (appointment.customerPhone && (await Setting.get('sms_enabled', false)) === true) {
    try {
      await sendSms({ to: appointment.customerPhone, message });
      notificationDelivery.sms = 'sent';
    } catch (error) {
      console.error(`Appointment SMS failed for ${appointment._id}:`, error);
      notificationDelivery.sms = 'failed';
      notificationDelivery.smsError = error.message;
    }
  }
  if (appointment.customerPhone && (await Setting.get('whatsapp_enabled', false)) === true) {
    try {
      await sendWhatsApp({ to: appointment.customerPhone, message });
      notificationDelivery.whatsapp = 'sent';
    } catch (error) {
      console.error(`Appointment WhatsApp notification failed for ${appointment._id}:`, error);
      notificationDelivery.whatsapp = 'failed';
      notificationDelivery.whatsappError = error.message;
    }
  }
  for (const [channel, status] of Object.entries(notificationDelivery)) {
    if (channel.endsWith('Error')) continue;
    try {
      await Notification.create({
        userId,
        appointmentId: appointment._id,
        channel,
        category: 'booking_confirmation',
        recipient: channel === 'email' ? appointment.customerEmail : appointment.customerPhone,
        subject: channel === 'email' ? 'Appointment created' : undefined,
        message: `Appointment created. Reference: ${appointment._id}`,
        status,
        sentAt: ['sent', 'mocked'].includes(status) ? new Date() : undefined,
        errorMessage: status === 'failed' ? notificationDelivery[`${channel}Error`] : undefined,
      });
    } catch (error) {
      console.error(`Could not log ${channel} notification for ${appointment._id}:`, error);
    }
  }

  return { appointment, qrToken: null, provider, notificationDelivery };
};

export const validateQrToken = (candidate, expectedHash) => {
  if (typeof candidate !== 'string' || !expectedHash) return false;
  const actualHash = Buffer.from(hashToken(candidate), 'hex');
  const savedHash = Buffer.from(expectedHash, 'hex');
  return actualHash.length === savedHash.length && crypto.timingSafeEqual(actualHash, savedHash);
};

/**
 * Allocate a queue token number + label to an appointment if it doesn't have one yet.
 * Safe to call multiple times (no-op when a token already exists). Used both when the
 * admin confirms an appointment and when a customer/staff checks in directly.
 * NOTE: the caller is responsible for saving the appointment.
 */
export const ensureTokenAllocated = async (appointment) => {
  if (appointment.tokenNumber) return appointment;

  const { tokenNumber } = await allocateToken({
    providerId: appointment.providerId,
    queueDate: appointment.queueDate,
    branchCode: appointment.branchCode,
    averageServiceMinutes: 15,
    queueStatus: 'paused',
  });

  // Token label prefix depends on priority
  let tokenPrefix = await Setting.get('queue_prefix', 'Q');
  if (appointment.priority === 'emergency') {
    tokenPrefix = await Setting.get('queue_prefix_emergency', 'EMG');
  } else if (appointment.priority === 'high') {
    tokenPrefix = await Setting.get('queue_prefix_vip', 'VIP');
  }

  const queueStartNumber = Number(await Setting.get('queue_start_number', 1)) || 1;
  const displayTokenNumber = tokenNumber + queueStartNumber - 1;

  appointment.tokenNumber = tokenNumber;
  appointment.tokenLabel = `${tokenPrefix}-${String(displayTokenNumber).padStart(3, '0')}`;
  appointment.estimatedWaitMinutes = Math.max(0, (tokenNumber - 1) * 15);
  return appointment;
};

/**
 * Generate Token Number + QR code and send confirmation
 * Called when admin confirms the appointment
 * Token expires in 1 minute for security
 */
export const generateQrAndNotify = async (appointment, userId) => {
  // Step 1: Allocate token number if not already allocated
  await ensureTokenAllocated(appointment);
  
  // Step 2: Generate new QR token
  const { token: qrToken, hash: qrTokenHash } = issueAppointmentQrToken();
  const now = new Date();
  const qrExpiresAt = new Date(now.getTime() + 60 * 1000); // 1 minute expiry
  
  // Update appointment with QR info
  appointment.qrTokenHash = qrTokenHash;
  appointment.qrGeneratedAt = now;
  appointment.qrExpiresAt = qrExpiresAt;
  await appointment.save();

  // Step 3: Send confirmation with Token + QR
  const notificationDelivery = {};
  const checkInOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const checkInLink = `${checkInOrigin}/check-in?appointmentId=${appointment._id}&token=${encodeURIComponent(qrToken)}&branchCode=${encodeURIComponent(appointment.branchCode || '')}`;
  const message = `Appointment ${appointment.tokenLabel} confirmed! Your token is ${appointment.tokenLabel}. Check in at ${appointment.branchCode}. QR code expires in 1 minute.`;
  
  if (appointment.customerEmail) {
    try {
      const qrImage = await QRCode.toDataURL(checkInLink, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
      const result = await sendEmail({
        to: appointment.customerEmail,
        subject: 'Smart Queue — Appointment Confirmed - Your Queue Token',
        html: `<p>Hello ${escapeHtml(appointment.customerName)},</p><p>Your appointment at ${escapeHtml(appointment.branchCode)} is confirmed!</p><p><strong style="font-size: 24px; color: #0f766e;">Your Token: ${escapeHtml(appointment.tokenLabel)}</strong></p><p>Scan this QR code to check in (expires in 1 minute):</p><img alt="Appointment check-in QR code" src="cid:appointment-checkin" width="240" height="240"><p>If needed, open <a href="${checkInLink}">your check-in link</a>.</p>`,
        text: message,
        attachments: [{
          filename: `appointment-${appointment.tokenLabel}-checkin.png`,
          content: Buffer.from(qrImage.slice('data:image/png;base64,'.length), 'base64'),
          contentType: 'image/png',
          cid: 'appointment-checkin',
        }],
      });
      notificationDelivery.email = result.mocked ? 'mocked' : 'sent';
    } catch (error) {
      console.error(`Appointment confirmation email with QR failed for ${appointment._id}:`, error);
      notificationDelivery.email = 'failed';
      notificationDelivery.emailError = error.message;
    }
  }
  
  if (appointment.customerPhone && (await Setting.get('sms_enabled', false)) === true) {
    try {
      await sendSms({ to: appointment.customerPhone, message });
      notificationDelivery.sms = 'sent';
    } catch (error) {
      console.error(`Appointment confirmation SMS failed for ${appointment._id}:`, error);
      notificationDelivery.sms = 'failed';
      notificationDelivery.smsError = error.message;
    }
  }
  
  if (appointment.customerPhone && (await Setting.get('whatsapp_enabled', false)) === true) {
    try {
      await sendWhatsApp({ to: appointment.customerPhone, message });
      notificationDelivery.whatsapp = 'sent';
    } catch (error) {
      console.error(`Appointment confirmation WhatsApp failed for ${appointment._id}:`, error);
      notificationDelivery.whatsapp = 'failed';
      notificationDelivery.whatsappError = error.message;
    }
  }
  
  // Log notifications
  for (const [channel, status] of Object.entries(notificationDelivery)) {
    if (channel.endsWith('Error')) continue;
    try {
      await Notification.create({
        userId,
        appointmentId: appointment._id,
        channel,
        category: 'appointment_confirmed',
        recipient: channel === 'email' ? appointment.customerEmail : appointment.customerPhone,
        subject: channel === 'email' ? 'Appointment confirmed with token' : undefined,
        message: `Appointment ${appointment.tokenLabel} confirmed. Token: ${appointment.tokenLabel}. QR expires in 1 minute.`,
        status,
        sentAt: ['sent', 'mocked'].includes(status) ? new Date() : undefined,
        errorMessage: status === 'failed' ? notificationDelivery[`${channel}Error`] : undefined,
      });
    } catch (error) {
      console.error(`Could not log ${channel} notification for ${appointment._id}:`, error);
    }
  }

  return { qrToken, notificationDelivery };
};

/**
 * Refresh QR code when it expires
 * Called when customer's QR code expires (after 1 minute)
 * Generates new QR and optionally resends to customer
 */
export const refreshQrCode = async (appointmentId, resendNotification = false) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw Object.assign(new Error('Appointment not found.'), { statusCode: 404 });
  }

  // Only refresh if QR has expired
  if (appointment.qrExpiresAt && new Date() < appointment.qrExpiresAt) {
    throw Object.assign(new Error('QR code has not expired yet.'), { statusCode: 409 });
  }

  // Generate new QR token
  const { token: qrToken, hash: qrTokenHash } = issueAppointmentQrToken();
  const now = new Date();
  const qrExpiresAt = new Date(now.getTime() + 60 * 1000); // 1 minute expiry
  
  // Update appointment with new QR
  appointment.qrTokenHash = qrTokenHash;
  appointment.qrGeneratedAt = now;
  appointment.qrExpiresAt = qrExpiresAt;
  await appointment.save();

  // Optionally resend QR to customer
  if (resendNotification && appointment.customerEmail) {
    try {
      const checkInOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      const checkInLink = `${checkInOrigin}/check-in?appointmentId=${appointment._id}&token=${encodeURIComponent(qrToken)}&branchCode=${encodeURIComponent(appointment.branchCode || '')}`;
      const qrImage = await QRCode.toDataURL(checkInLink, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
      
      await sendEmail({
        to: appointment.customerEmail,
        subject: 'Smart Queue — New QR Code (Expired)',
        html: `<p>Hello ${escapeHtml(appointment.customerName)},</p><p>Your previous QR code has expired. Here's your new QR code for check-in (expires in 1 minute):</p><img alt="Appointment check-in QR code" src="cid:appointment-checkin" width="240" height="240"><p>Your token: ${escapeHtml(appointment.tokenLabel)}</p>`,
        text: `Your QR code has expired. New check-in link: ${checkInLink}. Token: ${appointment.tokenLabel}`,
        attachments: [{
          filename: `appointment-${appointment.tokenLabel}-checkin-renewed.png`,
          content: Buffer.from(qrImage.slice('data:image/png;base64,'.length), 'base64'),
          contentType: 'image/png',
          cid: 'appointment-checkin',
        }],
      });
    } catch (error) {
      console.warn(`Failed to resend QR for appointment ${appointmentId}:`, error);
    }
  }

  return { qrToken, qrExpiresAt };
};

export const dayStart = startOfDay;

import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { Appointment } from './appointment.model.js';
import { Provider } from '../providers/provider.model.js';
import { attachServiceCatalog } from '../providers/service.catalog.js';
import { Setting } from '../settings/setting.model.js';
import { createAppointment, dayStart, issueAppointmentQrToken, validateQrToken, generateQrAndNotify, refreshQrCode, ensureTokenAllocated } from './token.service.js';
import { getQueueSnapshot, notifyQueueChanged } from '../queue/queue.service.js';
import { writeAuditLog } from '../settings/audit.service.js';
import { User } from '../users/user.model.js';
import { sendEmail } from '../notifications/email.service.js';
import { sendSms, sendWhatsApp } from '../notifications/sms.service.js';
import { Notification } from '../notifications/notification.model.js';
import { isWithinLocationRadius } from './location-checkin.service.js';
import { enforceCustomerAppointmentLimit, enforceDailyAppointmentLimit } from './appointment-limits.service.js';
import {
  getAppointmentUploadPath, isValidAppointmentFileId, removeAppointmentFiles, removeUploadedFiles,
} from './appointment-upload.js';

const publicAppointment = (appointment) => {
  const value = appointment.toObject ? appointment.toObject() : { ...appointment };
  delete value.qrTokenHash;
  delete value.__v;
  return value;
};

const validateObjectId = (id) => mongoose.isValidObjectId(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

/**
 * Get allowed appointment statuses from settings
 */
const getAllowedAppointmentStatuses = async () => {
  const statusConfig = await Setting.get('appointment_status_configuration', 'pending\nconfirmed\nqueued\ncalled\nin_service\ncompleted\ncancelled\nexpired\nno_show');
  return String(statusConfig)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * Validate if a status is allowed
 */
const validateStatus = async (status) => {
  const allowedStatuses = await getAllowedAppointmentStatuses();
  if (!allowedStatuses.includes(status)) {
    throw Object.assign(
      new Error(`Invalid appointment status '${status}'. Allowed statuses: ${allowedStatuses.join(', ')}`),
      { statusCode: 400 },
    );
  }
};

/**
 * Check if a status transition is valid
 */
const isValidStatusTransition = (fromStatus, toStatus) => {
  const validTransitions = {
    pending: ['confirmed', 'cancelled', 'expired', 'waiting'],
    confirmed: ['queued', 'cancelled', 'expired', 'waiting'],
    waiting: ['confirmed', 'cancelled', 'expired'],
    queued: ['called', 'completed', 'cancelled', 'no_show', 'in_service'],
    called: ['in_service', 'cancelled', 'no_show'],
    in_service: ['completed', 'cancelled', 'no_show'],
    completed: [], // Terminal state
    cancelled: [], // Terminal state
    expired: [], // Terminal state
    no_show: [], // Terminal state
  };

  return validTransitions[fromStatus]?.includes(toStatus) || false;
};

/**
 * Recalculate the estimated wait time for a just-checked-in appointment based on how
 * many customers are already active (queued/called/in_service) ahead of it. Persists
 * the value so Queue Control and the Live Monitor show an accurate wait.
 */
const updateCheckInWaitTime = async (appointment) => {
  try {
    const avgMinutes = Number(await Setting.get('appointment_duration_minutes', 15)) || 15;
    const ahead = await Appointment.countDocuments({
      providerId: appointment.providerId,
      queueDate: appointment.queueDate,
      status: { $in: ['queued', 'called', 'in_service'] },
      _id: { $ne: appointment._id },
      // Only those ahead in line (lower token number / earlier)
      tokenNumber: { $gt: 0, $lt: appointment.tokenNumber || Number.MAX_SAFE_INTEGER },
    });
    appointment.estimatedWaitMinutes = Math.max(0, ahead * avgMinutes);
    await Appointment.updateOne(
      { _id: appointment._id },
      { $set: { estimatedWaitMinutes: appointment.estimatedWaitMinutes } },
    );
  } catch (err) {
    console.error('updateCheckInWaitTime failed:', err.message);
  }
};

export const listProviders = async (_req, res, next) => {
  try {
    const providers = await Provider.find({ isActive: true })
      .select('name code type services serviceConfigurations branch avgServiceMinutes workingHours')
      .sort('name')
      .lean();
    return res.json(await attachServiceCatalog(providers));
  } catch (error) { next(error); }
};

export const listStaff = async (_req, res, next) => {
  try {
    const staff = await User.find({ role: 'staff', status: 'ACTIVE' }).select('name username').sort('name').lean();
    return res.json(staff);
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  const files = req.files || [];
  let appointmentSaved = false;
  try {
    const isStaffCreation = req.user && ['SUPER_ADMIN', 'admin', 'staff'].includes(req.user.role);
    if (!isStaffCreation && (await Setting.get('system_maintenance_mode', false)) === true) {
      return res.status(503).json({ message: 'Online booking is temporarily unavailable.' });
    }
    if (!isStaffCreation && (await Setting.get('service_allow_online_booking', true)) !== true) {
      return res.status(403).json({ message: 'Online booking is disabled.' });
    }
    const body = { ...req.body };
    if (typeof body.intakeData === 'string') {
      try {
        body.intakeData = JSON.parse(body.intakeData);
      } catch {
        throw Object.assign(new Error('Service requirement answers must be valid form data.'), { statusCode: 400 });
      }
    }
    const uploadedFiles = files.map(file => {
      const match = /^requirementFiles\[([a-zA-Z][a-zA-Z0-9_]{0,39})\]$/.exec(file.fieldname);
      if (!match) {
        throw Object.assign(new Error('One or more service requirement files are invalid.'), { statusCode: 400 });
      }
      const originalName = file.originalname.replace(/\\/g, '/').split('/').pop()
        .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'attachment';
      return {
        fieldName: match[1],
        fileId: file.filename,
        originalName,
        mimeType: file.mimetype,
        size: file.size,
      };
    });
    body.intakeData ??= {};
    const { appointment, qrToken, provider, notificationDelivery } = await createAppointment({
      ...body,
      uploadedFiles,
      onAppointmentSaved: () => { appointmentSaved = true; },
      userId: req.user?.userId,
      createdVia: req.user && ['SUPER_ADMIN', 'admin', 'staff'].includes(req.user.role) ? 'admin' : 'online',
      assignedStaffId: req.user && ['SUPER_ADMIN', 'admin', 'staff'].includes(req.user.role) ? req.body?.assignedStaffId : undefined,
      priority: 'normal',
    });
    await writeAuditLog(req, {
      action: 'appointment.created',
      resource: 'appointment',
      resourceId: appointment._id,
      details: { providerId: appointment.providerId, serviceCode: appointment.serviceCode },
    });
    return res.status(201).json({
      appointment: publicAppointment(appointment),
      qrToken,
      provider: { name: provider.name, code: provider.code },
      notificationDelivery,
    });
  } catch (error) {
    if (!appointmentSaved) {
      try {
        await removeUploadedFiles(files);
      } catch (cleanupError) {
        console.error('Could not remove appointment files after booking failed:', cleanupError);
      }
    }
    next(error);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({ userId: req.user.userId })
      .populate('providerId', 'name code branch')
      .sort('-scheduledStart')
      .lean();
    return res.json(appointments);
  } catch (error) { next(error); }
};

export const listAll = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.providerId) {
      if (!validateObjectId(req.query.providerId)) return res.status(400).json({ message: 'Invalid providerId.' });
      filter.providerId = req.query.providerId;
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.branchCode) filter.branchCode = String(req.query.branchCode).toUpperCase();
    if (req.query.serviceCode) filter.serviceCode = String(req.query.serviceCode).trim().toUpperCase();
    if (req.query.staffId) {
      if (!validateObjectId(req.query.staffId)) return res.status(400).json({ message: 'Invalid staffId.' });
      filter.assignedStaffId = req.query.staffId;
    }
    if (req.query.source && ['online', 'admin'].includes(req.query.source)) filter.createdVia = req.query.source;
    if (req.query.date) {
      const date = dayStart(req.query.date);
      if (Number.isNaN(date.getTime())) return res.status(400).json({ message: 'Invalid appointment date.' });
      filter.queueDate = date;
    }
    if (req.query.from || req.query.to) {
      filter.scheduledStart = {};
      if (req.query.from) {
        const from = dayStart(req.query.from);
        if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'Invalid start date.' });
        filter.scheduledStart.$gte = from;
      }
      if (req.query.to) {
        const until = dayStart(req.query.to);
        if (Number.isNaN(until.getTime())) return res.status(400).json({ message: 'Invalid end date.' });
        if (filter.scheduledStart.$gte && until < filter.scheduledStart.$gte) {
          return res.status(400).json({ message: 'The end date must be on or after the start date.' });
        }
        until.setUTCDate(until.getUTCDate() + 1);
        filter.scheduledStart.$lt = until;
      }
    }
    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 100);
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { tokenLabel: { $regex: search, $options: 'i' } },
      ];
    }
    const appointments = await Appointment.find(filter)
      .populate('providerId', 'name code branch')
      .populate('assignedStaffId', 'name username')
      .sort({ queueDate: -1, tokenNumber: 1 })
      .limit(500)
      .lean();
    const safe = appointments.map(({ qrTokenHash, ...appointment }) => appointment);
    return res.json(safe);
  } catch (error) { next(error); }
};

export const updateAppointment = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    const appointment = await Appointment.findOne({ _id: req.params.id, status: 'pending' });
    if (!appointment) return res.status(404).json({ message: 'A pending appointment was not found.' });
    const originalQueueDate = appointment.queueDate.getTime();
    const originalCustomerEmail = appointment.customerEmail || '';
    const originalCustomerPhone = appointment.customerPhone || '';
    const { customerName, customerEmail, customerPhone, scheduledStart, notes, assignedStaffId } = req.body || {};
    if (customerName !== undefined) {
      if (typeof customerName !== 'string' || !customerName.trim() || customerName.length > 150) {
        return res.status(400).json({ message: 'Customer name is required and must be 150 characters or fewer.' });
      }
      appointment.customerName = customerName.trim();
    }
    if (customerEmail !== undefined) {
      if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return res.status(400).json({ message: 'Enter a valid email address.' });
      appointment.customerEmail = customerEmail?.trim().toLowerCase() || undefined;
    }
    if (customerPhone !== undefined) {
      if (customerPhone && customerPhone.trim().length > 30) return res.status(400).json({ message: 'Enter a valid phone number.' });
      appointment.customerPhone = customerPhone?.trim() || undefined;
    }
    if (!appointment.customerEmail && !appointment.customerPhone) {
      return res.status(400).json({ message: 'An email address or phone number is required.' });
    }
    if (notes !== undefined) {
      if (typeof notes !== 'string' || notes.length > 2000) return res.status(400).json({ message: 'Notes must be 2000 characters or fewer.' });
      appointment.notes = notes;
    }
    if (assignedStaffId !== undefined) {
      if (assignedStaffId === null || assignedStaffId === '') {
        appointment.assignedStaffId = undefined;
      } else {
        if (!validateObjectId(assignedStaffId)) return res.status(400).json({ message: 'Invalid assigned staff member.' });
        const [staff, provider] = await Promise.all([
          User.findOne({ _id: assignedStaffId, role: 'staff', status: 'ACTIVE' }).select('_id'),
          Provider.findById(appointment.providerId).select('staffIds'),
        ]);
        if (!staff) return res.status(400).json({ message: 'Choose an active staff account.' });
        if (provider?.staffIds?.length && !provider.staffIds.some((id) => String(id) === String(staff._id))) {
          return res.status(400).json({ message: 'This staff member is not assigned to the selected location.' });
        }
        appointment.assignedStaffId = staff._id;
      }
    }
    if (scheduledStart !== undefined) {
      const start = new Date(scheduledStart);
      if (Number.isNaN(start.getTime()) || start <= new Date()) return res.status(400).json({ message: 'Appointment time must be a valid future date.' });
      appointment.scheduledStart = start;
      appointment.queueDate = dayStart(start);
    }
    const queueDateChanged = appointment.queueDate.getTime() !== originalQueueDate;
    const customerChanged = appointment.customerEmail !== originalCustomerEmail
      || appointment.customerPhone !== originalCustomerPhone;
    if (queueDateChanged) {
      await enforceDailyAppointmentLimit({
        queueDate: appointment.queueDate,
        excludeAppointmentId: appointment._id,
      });
    }
    if (queueDateChanged || customerChanged) {
      await enforceCustomerAppointmentLimit({
        queueDate: appointment.queueDate,
        customerEmail: appointment.customerEmail,
        customerPhone: appointment.customerPhone,
        excludeAppointmentId: appointment._id,
      });
    }
    await appointment.save();
    await writeAuditLog(req, { action: 'appointment.updated', resource: 'appointment', resourceId: appointment._id });
    return res.json({ appointment: publicAppointment(appointment) });
  } catch (error) { next(error); }
};

const performCheckIn = async (req, res, staffOverride = false) => {
    if (!validateObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    const appointment = await Appointment.findById(req.params.id).select('+qrTokenHash').populate('location', 'coordinates branchCode');
    if (!appointment || (!staffOverride && !validateQrToken(req.body?.token, appointment.qrTokenHash))) {
      return res.status(404).json({ message: 'Invalid appointment QR code.' });
    }
    if (!staffOverride && (await Setting.get('queue_require_location_checkin', true)) === true) {
      // Use appointment's location coordinates, not provider's branch
      const locationCoordinates = appointment.location?.coordinates || 
                                  (await Provider.findById(appointment.providerId).select('branch')).branch?.coordinates;
      if (!Number.isFinite(locationCoordinates?.latitude) || !Number.isFinite(locationCoordinates?.longitude)) {
        return res.status(409).json({ message: 'This location has not set its check-in coordinates. Please ask staff to check you in.' });
      }
      if (!isWithinLocationRadius(req.body?.coordinates, locationCoordinates)) {
        return res.status(403).json({ message: 'You must be within 150 metres of the appointment location to check in.' });
      }
    }
    if (req.body?.branchCode &&
        String(req.body.branchCode).toUpperCase() !== appointment.branchCode) {
      return res.status(403).json({ message: 'Check in at the location assigned to this appointment.' });
    }
    const provider = await Provider.findById(appointment.providerId).select('maxQueueSize');
    const queueLimit = Number(await Setting.get('queue_max_size', provider?.maxQueueSize || 50));
    const activeCount = await Appointment.countDocuments({
      providerId: appointment.providerId,
      queueDate: appointment.queueDate,
      status: { $in: ['queued', 'called', 'in_service'] },
    });
    if (Number.isFinite(queueLimit) && queueLimit > 0 && activeCount >= queueLimit) {
      return res.status(409).json({ message: 'This location queue is full. Please ask staff for help.' });
    }
    // Ensure the appointment has a queue token before it enters the queue (direct
    // check-ins without a prior confirm step won't have one yet).
    await ensureTokenAllocated(appointment);
    // Accept both pending (direct check-in) and confirmed (admin confirmed first) so the
    // standard confirm -> check-in workflow moves the appointment into the queue.
    const queued = await Appointment.findOneAndUpdate(
      { _id: appointment._id, status: { $in: ['pending', 'confirmed'] } },
      { $set: {
        status: 'queued', checkedInAt: new Date(), queueJoinedAt: new Date(),
        tokenNumber: appointment.tokenNumber, tokenLabel: appointment.tokenLabel,
        estimatedWaitMinutes: appointment.estimatedWaitMinutes,
      } },
      { new: true, runValidators: true },
    );
    if (!queued) return res.status(409).json({ message: 'Appointment has already been checked in or is no longer active.' });
    await updateCheckInWaitTime(queued);
    await writeAuditLog(req, { action: 'appointment.checked_in', resource: 'appointment', resourceId: queued._id, details: { branchCode: queued.branchCode, staffOverride } });
    await notifyQueueChanged(req, {
      providerId: queued.providerId,
      branchCode: queued.branchCode,
      serviceCode: queued.serviceCode,
      queueDate: queued.queueDate,
    });
    const snapshot = await getQueueSnapshot({
      providerId: queued.providerId,
      branchCode: queued.branchCode,
      serviceCode: queued.serviceCode,
      queueDate: queued.queueDate,
    });
    return res.json({ message: 'Check-in confirmed. You are now in the queue.', appointment: publicAppointment(queued), queue: snapshot });
};

export const checkIn = async (req, res, next) => {
  try {
    return await performCheckIn(req, res);
  } catch (error) { next(error); }
};

export const staffCheckIn = async (req, res, next) => {
  try {
    return await performCheckIn(req, res, true);
  } catch (error) { next(error); }
};

export const sendAppointmentAlert = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    const appointment = await Appointment.findById(req.params.id).select('+qrTokenHash').populate('providerId', 'name');
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });
    if (!appointment.customerEmail) return res.status(400).json({ message: 'This appointment has no customer email address.' });
    const status = appointment.status.replaceAll('_', ' ');
    const scheduled = appointment.scheduledStart.toLocaleString();
    const location = appointment.providerId?.name || appointment.branchCode;
    const isPending = appointment.status === 'pending';
    const issuedToken = isPending ? issueAppointmentQrToken() : null;
    const previousQrTokenHash = appointment.qrTokenHash;
    let checkInLink;
    let attachments;
    if (issuedToken) {
      const checkInUrl = new URL('/check-in', process.env.CLIENT_ORIGIN || 'http://localhost:5173');
      checkInUrl.searchParams.set('appointmentId', String(appointment._id));
      checkInUrl.searchParams.set('token', issuedToken.token);
      checkInUrl.searchParams.set('branchCode', appointment.branchCode || '');
      checkInLink = checkInUrl.toString();
      const qrImage = await QRCode.toDataURL(checkInLink, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
      attachments = [{
        filename: `appointment-${appointment.tokenLabel}-check-in.png`,
        content: Buffer.from(qrImage.slice('data:image/png;base64,'.length), 'base64'),
        contentType: 'image/png',
        cid: 'appointment-checkin',
      }];
      appointment.qrTokenHash = issuedToken.hash;
      await appointment.save();
    }
    const qrMessage = checkInLink
      ? `<p>Present this QR code at the assigned location to join the queue.</p><img alt="Appointment check-in QR code" src="cid:appointment-checkin" width="240" height="240"><p>If needed, open <a href="${escapeHtml(checkInLink)}">your check-in link</a>.</p>`
      : '';
    const message = `Hello ${appointment.customerName},\n\nAppointment ${appointment.tokenLabel}\nService: ${appointment.serviceCode}\nLocation: ${location}\nDate and time: ${scheduled}\nStatus: ${status}${checkInLink ? `\nCheck in: ${checkInLink}` : ''}`;
    let delivery;
    try {
      delivery = await sendEmail({
        to: appointment.customerEmail,
        subject: isPending ? 'Smart Queue — Appointment reminder and QR code' : `Smart Queue — Appointment ${status}`,
        html: `<p>Hello ${escapeHtml(appointment.customerName)},</p><p>This is an update about appointment <strong>${escapeHtml(appointment.tokenLabel)}</strong>.</p><p>Service: ${escapeHtml(appointment.serviceCode)}<br>Location: ${escapeHtml(location)}<br>Date and time: ${escapeHtml(scheduled)}<br>Status: ${escapeHtml(status)}</p>${qrMessage}`,
        text: message,
        attachments,
      });
    } catch (error) {
      if (issuedToken) {
        appointment.qrTokenHash = previousQrTokenHash;
        await appointment.save();
      }
      throw error;
    }
    if (issuedToken && delivery.mocked) {
      appointment.qrTokenHash = previousQrTokenHash;
      await appointment.save();
    }
    const deliveryStatus = delivery.mocked ? 'mocked' : 'sent';
    try {
      await Notification.create({
        userId: appointment.userId,
        appointmentId: appointment._id,
        channel: 'email',
        category: 'appointment_reminder',
        recipient: appointment.customerEmail,
        subject: isPending ? 'Appointment reminder and QR code' : `Appointment ${status}`,
        message: `Appointment ${appointment.tokenLabel} update sent to ${appointment.customerEmail}.`,
        status: deliveryStatus,
        sentAt: deliveryStatus === 'sent' ? new Date() : undefined,
      });
    } catch (error) {
      console.error(`Could not log appointment email for ${appointment._id}:`, error);
    }
    await writeAuditLog(req, {
      action: delivery.mocked ? 'appointment.email_alert_mocked' : 'appointment.email_alert_sent',
      resource: 'appointment',
      resourceId: appointment._id,
      details: { delivery: deliveryStatus, recipient: appointment.customerEmail },
    });
    return res.json({
      message: delivery.mocked
        ? 'Email alert was logged, but SMTP is not configured.'
        : `Appointment update sent to ${appointment.customerEmail}.`,
      delivery: delivery.mocked ? 'mocked' : 'sent',
    });
  } catch (error) { next(error); }
};

export const deleteAppointment = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    const activeStatuses = ['queued', 'called', 'in_service'];
    const appointment = await Appointment.findOneAndDelete({
      _id: req.params.id,
      status: { $nin: activeStatuses },
    });
    if (!appointment) {
      const existing = await Appointment.findById(req.params.id).select('status');
      if (existing && activeStatuses.includes(existing.status)) {
        return res.status(409).json({ message: 'Cancel the active queue entry before deleting this appointment.' });
      }
      return res.status(404).json({ message: 'Appointment not found.' });
    }
    try {
      await removeAppointmentFiles(appointment.intakeData);
    } catch (error) {
      console.error(`Could not remove uploaded files for deleted appointment ${appointment._id}:`, error);
      return res.status(500).json({ message: 'Appointment was deleted, but one or more uploaded files could not be removed.' });
    }
    await writeAuditLog(req, {
      action: 'appointment.deleted',
      resource: 'appointment',
      resourceId: appointment._id,
      details: { tokenLabel: appointment.tokenLabel, status: appointment.status },
    });
    return res.json({ message: `Appointment ${appointment.tokenLabel} deleted.` });
  } catch (error) { next(error); }
};

export const downloadRequirementFile = async (req, res, next) => {
  try {
    const { id, fieldName, fileId } = req.params;
    if (!validateObjectId(id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(fieldName) || !isValidAppointmentFileId(fileId)) {
      return res.status(404).json({ message: 'Appointment file not found.' });
    }
    const appointment = await Appointment.findById(id).select('intakeData').lean();
    if (!appointment) return res.status(404).json({ message: 'Appointment file not found.' });
    const file = appointment.intakeData?.[fieldName];
    if (!file || file.fileId !== fileId) return res.status(404).json({ message: 'Appointment file not found.' });
    res.set('X-Content-Type-Options', 'nosniff');
    return res.download(getAppointmentUploadPath(fileId), file.originalName, error => {
      if (error) next(error);
    });
  } catch (error) { next(error); }
};

export const getStatus = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    const appointment = await Appointment.findById(req.params.id).select('+qrTokenHash');
    if (!appointment || !validateQrToken(req.query.token, appointment.qrTokenHash)) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }
    return res.json({
      appointment: publicAppointment(appointment),
      queue: await getQueueSnapshot({
        providerId: appointment.providerId,
        branchCode: appointment.branchCode,
        serviceCode: appointment.serviceCode,
        queueDate: appointment.queueDate,
      }),
    });
  } catch (error) { next(error); }
};

export const setPriority = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    const priority = req.body?.priority?.toLowerCase?.() || req.body?.priority;
    console.log('setPriority - received priority value:', priority, 'type:', typeof priority);
    if (!['normal', 'high', 'emergency'].includes(priority)) {
      return res.status(400).json({ message: 'Priority must be normal, high, or emergency. Received: ' + priority });
    }
    if (priority === 'emergency' &&
        (await Setting.get('appointment_emergency', true)) !== true) {
      return res.status(403).json({ message: 'Emergency appointments are disabled in settings.' });
    }
    if (priority === 'emergency' &&
        (await Setting.get('queue_emergency_priority', true)) !== true) {
      return res.status(403).json({ message: 'Emergency queue priority is disabled in settings.' });
    }
    const priorityScore = priority === 'emergency' ? 0 : priority === 'high' ? 50 : 100;
    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['pending', 'confirmed', 'queued', 'called'] } },
      { $set: { priority, priorityScore } },
      { new: true, runValidators: true },
    );
    if (!appointment) return res.status(404).json({ message: 'Appointment not found or its status does not allow a priority change.' });
    await writeAuditLog(req, { action: 'appointment.priority_updated', resource: 'appointment', resourceId: appointment._id, details: { priority } });
    await notifyQueueChanged(req, {
      providerId: appointment.providerId, branchCode: appointment.branchCode, queueDate: appointment.queueDate,
      serviceCode: appointment.serviceCode,
    });
    return res.json(publicAppointment(appointment));
  } catch (error) { next(error); }
};

const closeAppointment = async (req, res, next, { action, reason, statuses, failureMessage }) => {
  try {
    if (!validateObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid appointment id.' });
    
    // Validate that 'cancelled' is an allowed status
    await validateStatus('cancelled');

    const appointment = await Appointment.findOne({ _id: req.params.id, status: { $in: statuses } });
    if (!appointment) return res.status(404).json({ message: failureMessage });

    // Validate status transition
    if (!isValidStatusTransition(appointment.status, 'cancelled')) {
      return res.status(409).json({
        message: `Cannot transition from '${appointment.status}' to 'cancelled'.`,
      });
    }

    const updatedAppointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, status: { $in: statuses } },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: String(reason).slice(0, 500),
          cancelledAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );
    if (!updatedAppointment) return res.status(404).json({ message: failureMessage });
    
    await writeAuditLog(req, { action, resource: 'appointment', resourceId: updatedAppointment._id });
    await notifyQueueChanged(req, {
      providerId: updatedAppointment.providerId, branchCode: updatedAppointment.branchCode, queueDate: updatedAppointment.queueDate,
      serviceCode: updatedAppointment.serviceCode,
    });
    return res.json(publicAppointment(updatedAppointment));
  } catch (error) { next(error); }
};

export const cancel = async (req, res, next) => closeAppointment(req, res, next, {
  action: 'appointment.cancelled',
  reason: req.body?.reason || 'Cancelled by staff',
  statuses: ['booked', 'pending', 'confirmed', 'queued', 'checked_in', 'called'],
  failureMessage: 'Appointment not found or cannot be cancelled.',
});

export const reject = async (req, res, next) => closeAppointment(req, res, next, {
  action: 'appointment.rejected',
  reason: req.body?.reason || 'Rejected by administrator',
  statuses: ['booked', 'pending', 'confirmed'],
  failureMessage: 'Appointment not found or cannot be rejected.',
});

export const sendNotification = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;
    const { channel, message, to } = req.body;

    // Validate input
    if (!['sms', 'whatsapp', 'email'].includes(channel)) {
      return res.status(400).json({ message: 'Channel must be sms, whatsapp, or email.' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required.' });
    }
    if (!to || typeof to !== 'string' || to.trim().length === 0) {
      return res.status(400).json({ message: 'Recipient (to) is required.' });
    }

    // Verify appointment exists
    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Send notification via the specified channel
    let result;
    let status = 'sent';
    let errorMessage = null;

    try {
      if (channel === 'sms') {
        result = await sendSms({ to, message });
      } else if (channel === 'whatsapp') {
        result = await sendWhatsApp({ to, message });
      } else if (channel === 'email') {
        // For email, treat 'to' as the recipient email address
        result = await sendEmail({
          to,
          subject: 'Smart Queue - Appointment Update',
          text: message,
          html: `<p>${escapeHtml(message)}</p>`,
        });
      }
    } catch (error) {
      status = error.statusCode === 503 ? 'failed' : 'failed';
      errorMessage = error.message;
      // Don't throw - we want to save the failed notification attempt
    }

    // Log notification in database
    const notification = new Notification({
      appointmentId,
      userId: appointment.userId,
      channel,
      category: 'general',
      recipient: to,
      message,
      status: result?.mocked ? 'mocked' : status,
      sentAt: new Date(),
      providerMessageId: result?.sid || result?.id,
      errorMessage,
      metadata: { sentBy: req.user?.userId },
    });
    await notification.save();

    // Log audit trail
    await writeAuditLog(req, {
      action: 'notification.sent',
      resource: 'appointment',
      resourceId: appointmentId,
      details: { channel, recipient: to, status: notification.status },
    });

    if (errorMessage) {
      return res.status(200).json({
        message: `Notification queued but encountered an issue: ${errorMessage}`,
        notification: {
          _id: notification._id,
          channel: notification.channel,
          status: notification.status,
          message: notification.message,
          sentAt: notification.sentAt,
        },
      });
    }

    return res.json({
      message: `${channel.toUpperCase()} notification sent successfully`,
      notification: {
        _id: notification._id,
        channel: notification.channel,
        status: notification.status,
        message: notification.message,
        sentAt: notification.sentAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getNotificationHistory = async (req, res, next) => {
  try {
    const { id: appointmentId } = req.params;

    if (!validateObjectId(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID.' });
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    const notifications = await Notification.find({ appointmentId })
      .sort('-createdAt')
      .select('channel status message sentAt createdAt')
      .lean();

    return res.json(notifications);
  } catch (error) {
    next(error);
  }
};


// ===== NEW QR CHECK-IN ENDPOINTS (PART 3) =====

import { Location } from '../locations/location.model.js';
import { Counter } from './counter.model.js';
import { getNextQueueNumber } from './counter.service.js';
import jwt from 'jsonwebtoken';

const QR_SECRET = process.env.QR_SECRET || 'your-qr-secret-change-in-production';
const QR_TOKEN_LIFETIME = 60; // 60 seconds (QR code valid for 1 minute)
const CHECKIN_OPEN_MINUTES = Number(process.env.CHECKIN_OPEN_MINUTES_BEFORE) || 30;
const CHECKIN_EXPIRE_MINUTES = Number(process.env.CHECKIN_EXPIRE_MINUTES_AFTER) || 15;

/**
 * PATCH /api/admin/appointments/:id/confirm
 * Admin confirms a pending appointment, sets check-in window
 * Status: pending -> confirmed
 */
export const confirmAppointment = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment id.' });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Validate status transition
    if (!isValidStatusTransition(appointment.status, 'confirmed')) {
      return res.status(409).json({
        message: `Cannot transition from '${appointment.status}' to 'confirmed'. Current status: ${appointment.status}`,
      });
    }

    // For walk-in / flexible services (no scheduled time), base the check-in window on the
    // moment of confirmation rather than the stale placeholder scheduledStart. The window
    // opens immediately and stays open generously so staff/customer can check in anytime.
    const isWalkIn = appointment.hasScheduledTime === false;
    const startTime = isWalkIn ? new Date() : new Date(appointment.scheduledStart);
    const checkInOpensAt = isWalkIn
      ? new Date()
      : new Date(startTime.getTime() - CHECKIN_OPEN_MINUTES * 60000);
    const checkInExpiresAt = isWalkIn
      // Walk-in: give the whole business day (24h) to check in
      ? new Date(startTime.getTime() + 24 * 60 * 60000)
      : new Date(startTime.getTime() + CHECKIN_EXPIRE_MINUTES * 60000);

    appointment.status = 'confirmed';
    appointment.startTime = startTime;
    appointment.checkInOpensAt = checkInOpensAt;
    appointment.checkInExpiresAt = checkInExpiresAt;

    // Allocate token number on confirmation so it appears in confirmed queue
    await ensureTokenAllocated(appointment);

    await appointment.save();

    await writeAuditLog(req, {
      action: 'appointment.confirmed',
      resource: 'appointment',
      resourceId: appointment._id,
      details: { tokenLabel: appointment.tokenLabel, checkInWindow: `${checkInOpensAt.toISOString()} to ${checkInExpiresAt.toISOString()}` },
    });

    // Generate QR code and send confirmation with token and QR to customer
    try {
      await generateQrAndNotify(appointment, req.user?._id);
    } catch (error) {
      console.error(`Failed to generate QR and notify for appointment ${appointment._id}:`, error);
      // Don't fail the confirmation if notification fails
    }

    // Notify queue system of the change
    await notifyQueueChanged(req, {
      providerId: appointment.providerId,
      branchCode: appointment.branchCode,
      serviceCode: appointment.serviceCode,
      queueDate: appointment.queueDate,
    });

    return res.json(publicAppointment(appointment));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/appointments/:id/qr
 * Customer requests QR token for check-in
 * Returns JWT: { aid: appointmentId, exp: <60s from now> }
 * Must be called by authenticated customer who owns the appointment
 */
export const getQrToken = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment id.' });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Check ownership (customer can only get QR for their own appointment)
    if (appointment.userId?.toString() !== req.user?.userId) {
      return res.status(403).json({ message: 'You do not own this appointment.' });
    }

    // Check status is confirmed
    if (appointment.status !== 'confirmed') {
      return res.status(409).json({ message: `Cannot generate QR: appointment status is ${appointment.status}. Appointment must be confirmed.` });
    }

    // Check check-in window
    const now = new Date();
    if (now < appointment.checkInOpensAt) {
      return res.status(400).json({ message: `Check-in window has not opened yet. Opens at ${appointment.checkInOpensAt.toISOString()}.` });
    }

    if (now > appointment.checkInExpiresAt) {
      return res.status(400).json({ message: `Check-in window has expired. Expired at ${appointment.checkInExpiresAt.toISOString()}.` });
    }

    // Generate JWT token
    const token = jwt.sign(
      { aid: appointment._id.toString() },
      QR_SECRET,
      { expiresIn: QR_TOKEN_LIFETIME }
    );

    res.set('Cache-Control', 'no-store');
    return res.json({ token, expiresIn: QR_TOKEN_LIFETIME });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/appointments/:id/qr-image/:token
 * Generate QR code image dynamically (for embedding in email)
 * Auto-refreshes code every 60 seconds based on time
 */
export const getQrImage = async (req, res, next) => {
  try {
    const { id, token } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid appointment id.' });
    }

    const appointment = await Appointment.findById(id).select('+qrAccessToken +qrToken +qrGeneratedAt +qrExpiresAt').lean();

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Validate access token
    if (appointment.qrAccessToken !== token) {
      return res.status(403).json({ message: 'Invalid access token.' });
    }

    // Check appointment is confirmed
    if (appointment.status !== 'confirmed') {
      return res.status(409).json({ message: 'Appointment is not confirmed yet.' });
    }

    const now = new Date();
    let currentCode = appointment.qrToken;
    let codeExpiresAt = appointment.qrExpiresAt;

    // If current code has expired, generate a new one
    if (codeExpiresAt < now) {
      const newCode = Math.floor(10000000 + Math.random() * 90000000).toString();
      const newExpiryTime = new Date(now.getTime() + 60 * 1000);
      
      await Appointment.updateOne(
        { _id: id },
        {
          qrToken: newCode,
          qrGeneratedAt: now,
          qrExpiresAt: newExpiryTime,
          $push: { usedQrCodes: appointment.qrToken }, // Track old code as used
        }
      );

      currentCode = newCode;
      codeExpiresAt = newExpiryTime;
    }

    // Generate QR code image as PNG
    const qrImage = await QRCode.toBuffer(currentCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });

    // Set cache headers to prevent caching (so it regenerates every access)
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Content-Type', 'image/png');
    
    return res.send(qrImage);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/appointments/:id/qr/:token
 * Get current QR code with countdown and auto-refresh support
 * Token is the secure access token sent in the email
 */
export const getQrCode = async (req, res, next) => {
  try {
    const { id, token } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid appointment id.' });
    }

    const appointment = await Appointment.findById(id).select('+qrAccessToken +qrToken +qrGeneratedAt +qrExpiresAt').lean();

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Validate access token
    if (appointment.qrAccessToken !== token) {
      return res.status(403).json({ message: 'Invalid access token.' });
    }

    // Check appointment is confirmed
    if (appointment.status !== 'confirmed') {
      return res.status(409).json({ message: 'Appointment is not confirmed yet.' });
    }

    const now = new Date();
    
    // If current code has expired, generate a new one
    if (appointment.qrExpiresAt < now) {
      const newCode = Math.floor(10000000 + Math.random() * 90000000).toString();
      const newExpiryTime = new Date(now.getTime() + 60 * 1000);
      
      await Appointment.updateOne(
        { _id: id },
        {
          qrToken: newCode,
          qrGeneratedAt: now,
          qrExpiresAt: newExpiryTime,
          $push: { usedQrCodes: appointment.qrToken }, // Track old code as used
        }
      );

      appointment.qrToken = newCode;
      appointment.qrGeneratedAt = now;
      appointment.qrExpiresAt = newExpiryTime;
    }

    // Generate QR image from 8-digit code
    const qrImage = await QRCode.toDataURL(appointment.qrToken, { 
      errorCorrectionLevel: 'M', 
      margin: 2, 
      width: 320 
    });

    // Calculate countdown seconds
    const secondsRemaining = Math.max(0, Math.ceil((appointment.qrExpiresAt - now) / 1000));

    return res.json({
      appointmentId: id,
      code: appointment.qrToken,
      qrImage: qrImage, // Base64 QR image
      expiresAt: appointment.qrExpiresAt.toISOString(),
      secondsRemaining: secondsRemaining,
      tokenLabel: appointment.tokenLabel,
      customerName: appointment.customerName,
      service: appointment.serviceCode,
      location: appointment.branchCode,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/appointments/checkin-by-code
 * Check-in using manually entered 8-digit code or scanned code
 * Called from Queue Control when staff enters/scans code
 */
export const checkInByCode = async (req, res, next) => {
  try {
    const { code, branchCode } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: 'Check-in code is required.' });
    }

    const now = new Date();

    // Find appointment with this code that hasn't expired
    const appointment = await Appointment.findOne({
      qrToken: code.trim(),
      qrExpiresAt: { $gt: now }, // Code must not be expired
      status: 'confirmed', // Must be confirmed
    })
      .select('+qrToken +usedQrCodes');

    if (!appointment) {
      return res.status(401).json({ 
        message: 'Invalid or expired check-in code. Please ask customer to open the QR code link again.' 
      });
    }

    // Check if code was already used (prevent replay attacks)
    if (appointment.usedQrCodes?.includes(code.trim())) {
      return res.status(409).json({ 
        message: 'This check-in code has already been used. Please request a new one.' 
      });
    }

    // Check if already checked in
    if (appointment.status !== 'confirmed') {
      return res.status(409).json({ 
        message: `Appointment has already been checked in or is no longer available (status: ${appointment.status}).` 
      });
    }

    // Validate check-in window
    if (now < appointment.checkInOpensAt || now > appointment.checkInExpiresAt) {
      return res.status(409).json({ 
        message: 'Check-in window is not open for this appointment.' 
      });
    }

    // Update appointment to queued and mark code as used
    const result = await Appointment.findByIdAndUpdate(
      appointment._id,
      {
        status: 'queued',
        checkedInAt: now,
        checkInMethod: 'qr_admin',
        $push: { usedQrCodes: code.trim() }, // Add this code to used codes
      },
      { new: true }
    )
      .populate('providerId', 'name')
      .populate('userId', 'name phone');

    // Notify queue system
    await notifyQueueChanged(req, {
      providerId: result.providerId,
      branchCode: result.branchCode,
      serviceCode: result.serviceCode,
      queueDate: result.queueDate,
    });

    // Log audit
    await writeAuditLog(req, {
      action: 'appointment.checked_in_by_code',
      resource: 'appointment',
      resourceId: result._id,
      details: { tokenLabel: result.tokenLabel, method: 'qr_code' },
    });

    return res.json({
      success: true,
      message: 'Check-in successful!',
      appointment: {
        tokenLabel: result.tokenLabel,
        customerName: result.customerName,
        service: result.serviceCode,
        location: result.branchCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/appointments/:id/qr/:token
 * Customer requests new QR code (validates access token)
 */
export const refreshQrToken = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment id.' });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Check ownership
    if (appointment.userId?.toString() !== req.user?.userId) {
      return res.status(403).json({ message: 'You do not own this appointment.' });
    }

    // Refresh QR and optionally resend via email
    const { qrToken, qrExpiresAt } = await refreshQrCode(appointment._id, req.body?.resendEmail === true);

    res.set('Cache-Control', 'no-store');
    return res.json({ 
      message: 'QR code refreshed successfully',
      token: qrToken,
      expiresAt: qrExpiresAt,
      checkInCode: checkInCode,
      expiresIn: '60s'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/scan
 * Admin scans QR token
 * Verifies JWT and returns appointment preview (no state changes)
 */
export const scanQrToken = async (req, res, next) => {
  try {
    const { token } = req.body || {};

    if (!token) {
      return res.status(400).json({ message: 'QR token is required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, QR_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'QR token has expired. Ask customer to refresh.' });
      }
      return res.status(401).json({ message: 'Invalid QR token.' });
    }

    const appointmentId = decoded.aid;
    if (!validateObjectId(appointmentId)) {
      return res.status(401).json({ message: 'Invalid QR token.' });
    }

    const appointment = await Appointment.findById(appointmentId)
      .populate('userId', 'name phone photo')
      .lean();

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Validate appointment state for check-in
    if (appointment.status !== 'confirmed') {
      return res.status(409).json({ message: `Cannot scan: appointment status is ${appointment.status}. Must be confirmed.` });
    }

    const now = new Date();
    if (now > appointment.checkInExpiresAt) {
      return res.status(409).json({ message: 'Check-in window has expired.' });
    }

    // Return preview (no state change)
    const phoneLastFour = appointment.customerPhone?.slice(-4) || '****';
    return res.json({
      appointmentId: appointment._id,
      customerName: appointment.customerName,
      phoneLastFour,
      photoUrl: appointment.userId?.photo || null,
      service: appointment.serviceCode,
      location: appointment.location,
      startTime: appointment.startTime,
      status: appointment.status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/appointments/validate-checkin-code
 * Validates 8-digit check-in code from email QR
 * Returns appointment preview if code is valid and not expired
 */
export const validateCheckInCode = async (req, res, next) => {
  try {
    const { code } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: 'Check-in code is required.' });
    }

    // Find appointment with matching QR token that hasn't expired
    const now = new Date();
    const appointment = await Appointment.findOne({
      qrToken: code.trim(),
      qrExpiresAt: { $gt: now }, // QR not expired
    })
      .populate('userId', 'name phone photo')
      .select('+qrToken');

    if (!appointment) {
      return res.status(401).json({ message: 'Invalid or expired check-in code.' });
    }

    // Validate appointment state for check-in
    if (appointment.status !== 'confirmed') {
      return res.status(409).json({ message: `Cannot check in: appointment status is ${appointment.status}. Must be confirmed.` });
    }

    if (now > appointment.checkInExpiresAt) {
      return res.status(409).json({ message: 'Check-in window has expired.' });
    }

    // Return preview (no state change)
    const phoneLastFour = appointment.customerPhone?.slice(-4) || '****';
    return res.json({
      appointmentId: appointment._id,
      checkInCode: appointment.qrToken,
      customerName: appointment.customerName,
      phoneLastFour,
      photoUrl: appointment.userId?.photo || null,
      service: appointment.serviceCode,
      location: appointment.location,
      startTime: appointment.startTime,
      status: appointment.status,
      tokenLabel: appointment.tokenLabel,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/checkin/:id
 * Admin confirms check-in, atomically assigns queue number
 * Status: confirmed -> checked_in
 * Must be called within check-in window and before already checked in
 */
export const checkInAppointment = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment id.' });
    }

    // Atomic operation: find confirmed and update to queued (joins the queue)
    const appointment = await Appointment.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'confirmed',
      },
      {
        $set: {
          status: 'queued',
          checkInMethod: 'qr_admin',
          checkedInAt: new Date(),
          checkedInBy: req.user?.userId,
          queueJoinedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    ).populate('location', '_id');

    if (!appointment) {
      const existing = await Appointment.findById(req.params.id).select('status checkedInAt');
      if (existing?.status === 'queued') {
        return res.status(409).json({ message: 'Appointment already checked in and queued.' });
      }
      return res.status(404).json({ message: 'Appointment not found or not in confirmed status.' });
    }

    // Check time window
    const now = new Date();
    if (now > appointment.checkInExpiresAt) {
      // Revert the update
      await Appointment.updateOne({ _id: appointment._id }, { $set: { status: 'confirmed' } });
      return res.status(409).json({ message: 'Check-in window has expired.' });
    }

    // Atomic queue number assignment
    if (appointment.location) {
      try {
        const queueNumber = await getNextQueueNumber(
          appointment.location._id || appointment.location,
          new Date(appointment.scheduledStart)
        );
        appointment.queueNumber = queueNumber;
        await appointment.save();
      } catch (err) {
        console.error('Failed to assign queue number:', err);
        // Continue anyway, queue number is optional
      }
    }

    // Recalculate wait time based on current queue position
    await updateCheckInWaitTime(appointment);

    await writeAuditLog(req, {
      action: 'appointment.checked_in_qr',
      resource: 'appointment',
      resourceId: appointment._id,
      details: { method: 'qr_admin', queueNumber: appointment.queueNumber },
    });

    // Notify queue system of the change
    await notifyQueueChanged(req, {
      providerId: appointment.providerId,
      branchCode: appointment.branchCode,
      serviceCode: appointment.serviceCode,
      queueDate: appointment.queueDate,
    });

    return res.json({
      message: 'Check-in successful',
      appointment: publicAppointment(appointment),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/appointments/:id/manual-checkin
 * Admin manually checks in a customer (for offline/dead phone scenarios)
 * Status: confirmed -> checked_in
 */
export const manualCheckIn = async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment id.' });
    }

    const appointment = await Appointment.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'confirmed',
      },
      {
        $set: {
          status: 'queued',
          checkInMethod: 'manual',
          checkedInAt: new Date(),
          checkedInBy: req.user?.userId,
          queueJoinedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    ).populate('location', '_id');

    if (!appointment) {
      const existing = await Appointment.findById(req.params.id).select('status checkedInAt');
      if (existing?.status === 'queued') {
        return res.status(409).json({ message: 'Appointment already checked in and queued.' });
      }
      return res.status(404).json({ message: 'Appointment not found or not in confirmed status.' });
    }

    // Atomic queue number assignment
    if (appointment.location) {
      try {
        const queueNumber = await getNextQueueNumber(
          appointment.location._id || appointment.location,
          new Date(appointment.scheduledStart)
        );
        appointment.queueNumber = queueNumber;
        await appointment.save();
      } catch (err) {
        console.error('Failed to assign queue number:', err);
      }
    }

    // Recalculate wait time based on current queue position
    await updateCheckInWaitTime(appointment);

    await writeAuditLog(req, {
      action: 'appointment.checked_in_manual',
      resource: 'appointment',
      resourceId: appointment._id,
      details: { method: 'manual', reason: req.body?.reason || 'Manual check-in', queueNumber: appointment.queueNumber },
    });

    // Notify queue system of the change
    await notifyQueueChanged(req, {
      providerId: appointment.providerId,
      branchCode: appointment.branchCode,
      serviceCode: appointment.serviceCode,
      queueDate: appointment.queueDate,
    });

    return res.json({
      message: 'Manual check-in successful',
      appointment: publicAppointment(appointment),
    });
  } catch (error) {
    next(error);
  }
};

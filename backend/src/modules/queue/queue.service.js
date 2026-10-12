import mongoose from 'mongoose';
import { Appointment } from '../appointments/appointment.model.js';
import { QueueSession } from './queueSession.model.js';
import { Setting } from '../settings/setting.model.js';
import { ensureTokenAllocated } from '../appointments/token.service.js';

const beginningOfDay = (input = new Date()) => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('Invalid queue date.'), { statusCode: 400 });
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const validateProviderId = (providerId) => {
  if (!mongoose.isValidObjectId(providerId)) {
    throw Object.assign(new Error('A valid provider is required.'), { statusCode: 400 });
  }
};

const scopeFor = ({ providerId, branchCode, serviceCode, queueDate }) => ({
  providerId,
  queueDate: beginningOfDay(queueDate),
  ...(branchCode ? { branchCode: String(branchCode).toUpperCase() } : {}),
  ...(serviceCode ? { serviceCode: String(serviceCode).toUpperCase() } : {}),
});

const queueRoom = ({ providerId, branchCode, serviceCode, queueDate }) =>
  `queue:${providerId}:${String(branchCode || '').toUpperCase()}:${String(serviceCode || '').toUpperCase()}:${beginningOfDay(queueDate).toISOString().slice(0, 10)}`;

const emitUpdate = async (req, scope) => {
  const io = req.app.get('io');
  if (!io) return;
  const snapshot = await getQueueSnapshot(scope);
  io.to(queueRoom(scope)).emit('queue:update', snapshot);
};

export const getQueueSnapshot = async ({ providerId, branchCode, serviceCode, queueDate = new Date() }) => {
  validateProviderId(providerId);
  const scope = scopeFor({ providerId, branchCode, serviceCode, queueDate });
  
  // Ensure confirmed appointments have token numbers allocated
  try {
    const confirmedWithoutTokens = await Appointment.find({
      ...scope,
      status: 'confirmed',
      tokenNumber: { $exists: false }
    }).limit(100);
    
    for (const appointment of confirmedWithoutTokens) {
      await ensureTokenAllocated(appointment);
      await appointment.save();
    }
  } catch (error) {
    console.error('Failed to allocate tokens for confirmed appointments:', error);
  }

  // Determine sort order based on priority strategy setting
  const priorityStrategy = await Setting.get('queue_priority_strategy', 'FIFO');
  let sortOrder;
  
  if (priorityStrategy === 'Priority-Based') {
    // Priority-based: emergency first, then VIP, then normal. Within each priority, FIFO by token
    sortOrder = { priorityScore: 1, tokenNumber: 1, createdAt: 1 };
  } else {
    // FIFO (default): strict first-in-first-out, ignore priority
    sortOrder = { tokenNumber: 1, createdAt: 1 };
  }
  
  const [session, current, waiting, confirmedAppointments, total, showCustomerNames, callingMethod] = await Promise.all([
    QueueSession.findOne({ providerId, queueDate: scope.queueDate }).lean(),
    Appointment.findOne({ ...scope, status: { $in: ['called', 'in_service'] } })
      .sort('-calledAt').select('tokenNumber tokenLabel serviceCode customerName status priority calledAt estimatedWaitMinutes assignedCounterNumber').lean(),
    // Waiting list shows ONLY checked-in customers (status 'queued'). 
    // Confirmed appointments are not in queue yet - they appear only AFTER customer 
    // scans QR code or staff manually checks them in.
    Appointment.find({ ...scope, status: 'queued', tokenNumber: { $gt: 0 } })
      .sort(sortOrder)
      .select('tokenNumber tokenLabel serviceCode customerName status priority createdAt estimatedWaitMinutes assignedCounterNumber').lean(),
    // Count confirmed appointments (not yet checked-in)
    // Note: tokenNumber should be set on confirmation, but we count all confirmed just in case
    Appointment.countDocuments({ ...scope, status: 'confirmed' }),
    Appointment.countDocuments({ ...scope, status: { $nin: ['cancelled', 'no_show'] } }),
    Setting.get('queue_show_customer_names', false),
    Setting.get('queue_calling_method', 'all_counters'),
  ]);
  if (!showCustomerNames) {
    if (current) delete current.customerName;
    waiting.forEach((entry) => { delete entry.customerName; });
  }
  return {
    providerId,
    branchCode: String(branchCode || session?.branchCode || '').toUpperCase(),
    queueDate: scope.queueDate,
    status: session?.status || 'closed',
    current,
    next: waiting[0] || null,
    nextNext: waiting[1] || null,
    waiting,
    total,
    waitingCount: waiting.length,
    confirmedCount: confirmedAppointments,
    served: session?.servedCount || 0,
    queuePriorityStrategy: priorityStrategy,
    queueCallingMethod: callingMethod,
  };
};

export const startQueue = async ({ providerId, branchCode, queueDate = new Date() }, req) => {
  validateProviderId(providerId);
  const scope = scopeFor({ providerId, branchCode, queueDate });
  const session = await QueueSession.findOneAndUpdate(
    { providerId, queueDate: scope.queueDate },
    { $set: { status: 'open', branchCode: scope.branchCode || '' }, $setOnInsert: { openedAt: new Date() } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );
  await emitUpdate(req, scope);
  return session;
};

export const callNext = async ({ providerId, branchCode, queueDate = new Date() }, req) => {
  validateProviderId(providerId);
  const scope = scopeFor({ providerId, branchCode, queueDate });
  const session = await QueueSession.findOne({ providerId, queueDate: scope.queueDate });
  if (!session || session.status !== 'open') {
    throw Object.assign(new Error('Start the queue before calling the next token.'), { statusCode: 409 });
  }
  const active = await Appointment.exists({ ...scope, status: 'in_service' });
  if (active) throw Object.assign(new Error('Complete the current service before calling another token.'), { statusCode: 409 });
  
  // Determine sort order based on priority strategy setting
  const priorityStrategy = await Setting.get('queue_priority_strategy', 'FIFO');
  let sortOrder;
  
  if (priorityStrategy === 'Priority-Based') {
    // Priority-based: emergency first, then VIP, then normal. Within each priority, FIFO by token
    sortOrder = { priorityScore: 1, tokenNumber: 1, createdAt: 1 };
  } else {
    // FIFO (default): strict first-in-first-out, ignore priority
    sortOrder = { tokenNumber: 1, createdAt: 1 };
  }
  
  // Determine calling method and assign counter if needed
  const callingMethod = await Setting.get('queue_calling_method', 'all_counters');
  
  // Only checked-in customers (status 'queued') can be called next.
  const appointment = await Appointment.findOneAndUpdate(
    { ...scope, status: 'queued', tokenNumber: { $gt: 0 } },
    { $set: { status: 'called', calledAt: new Date() } },
    { new: true, sort: sortOrder, runValidators: true },
  );
  
  if (!appointment) return null;
  
  // If using specific_counter method, assign to counter
  if (callingMethod === 'specific_counter') {
    try {
      // Find the next available counter
      const CounterAssignment = (await import('../queue/counterAssignment.model.js')).CounterAssignment;
      const availableCounter = await CounterAssignment.findOne({
        providerId,
        queueDate: scope.queueDate,
        status: { $in: ['assigned', 'on_break'] },
      }).sort('counterNumber');
      
      if (availableCounter) {
        appointment.assignedCounterNumber = availableCounter.counterNumber;
        appointment.assignedCounterId = availableCounter._id;
        await appointment.save();
      }
    } catch (error) {
      console.error('[Queue] Error assigning counter to appointment:', error);
      // Continue without counter assignment - not critical
    }
  }
  
  session.currentToken = appointment.tokenNumber;
  await session.save();
  await emitUpdate(req, scope);
  return appointment;
};

export const startServing = async ({ providerId, branchCode, queueDate = new Date() }, req) => {
  validateProviderId(providerId);
  const scope = scopeFor({ providerId, branchCode, queueDate });
  const appointment = await Appointment.findOneAndUpdate(
    { ...scope, status: 'called' },
    { $set: { status: 'in_service' } },
    { new: true, sort: '-calledAt', runValidators: true },
  );
  if (!appointment) throw Object.assign(new Error('There is no called token ready to start.'), { statusCode: 409 });
  await emitUpdate(req, scope);
  return appointment;
};

export const completeCurrent = async ({ providerId, branchCode, queueDate = new Date() }, req) => {
  validateProviderId(providerId);
  const scope = scopeFor({ providerId, branchCode, queueDate });
  const appointment = await Appointment.findOneAndUpdate(
    { ...scope, status: 'in_service' },
    { $set: { status: 'completed', completedAt: new Date() } },
    { new: true, sort: '-calledAt', runValidators: true },
  );
  if (!appointment) throw Object.assign(new Error('There is no active service to complete.'), { statusCode: 409 });
  await QueueSession.updateOne(scope, { $inc: { servedCount: 1 } });
  await emitUpdate(req, scope);
  return appointment;
};

export const cancelQueueEntry = async ({ appointmentId, providerId, branchCode, queueDate = new Date() }, req) => {
  const scope = scopeFor({ providerId, branchCode, queueDate });
  const appointment = await Appointment.findOneAndUpdate(
    { _id: appointmentId, ...scope, status: { $in: ['pending', 'queued', 'called'] } },
    { $set: { status: 'cancelled', cancellationReason: 'Cancelled by staff' } },
    { new: true, runValidators: true },
  );
  if (!appointment) throw Object.assign(new Error('Queue entry was not found or cannot be cancelled.'), { statusCode: 404 });
  await emitUpdate(req, scope);
  return appointment;
};

export const notifyQueueChanged = emitUpdate;
export const normalizeQueueDate = beginningOfDay;

import mongoose from 'mongoose';
import { CounterAssignment } from './counterAssignment.model.js';
import { Setting } from '../settings/setting.model.js';
import { Provider } from '../providers/provider.model.js';
import { User } from '../users/user.model.js';
import { AuditLog } from '../audit/audit.model.js';

const normalizeQueueDate = (input = new Date()) => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('Invalid queue date.'), { statusCode: 400 });
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

/**
 * Check if counter assignment is enabled
 */
export const isCounterAssignmentEnabled = async () => {
  const mode = await Setting.get('counter_assignment_mode', 'auto');
  return mode !== 'disabled';
};

/**
 * Assign counter to staff member
 */
export const assignCounter = async ({ staffId, providerId, counterNumber, queueDate = new Date() }, req) => {
  if (!mongoose.isValidObjectId(staffId)) {
    throw Object.assign(new Error('Invalid staff member ID.'), { statusCode: 400 });
  }
  if (!mongoose.isValidObjectId(providerId)) {
    throw Object.assign(new Error('Invalid provider ID.'), { statusCode: 400 });
  }

  const [staff, provider] = await Promise.all([
    User.findOne({ _id: staffId, role: 'staff', status: 'ACTIVE' }),
    Provider.findOne({ _id: providerId, isActive: true }),
  ]);

  if (!staff) throw Object.assign(new Error('Staff member not found or inactive.'), { statusCode: 404 });
  if (!provider) throw Object.assign(new Error('Provider not found or inactive.'), { statusCode: 404 });

  const qDate = normalizeQueueDate(queueDate);

  // Check if counter is already assigned
  const existingAssignment = await CounterAssignment.findOne({
    providerId,
    counterNumber: String(counterNumber).trim().toUpperCase(),
    queueDate: qDate,
    status: { $ne: 'unassigned' },
  });

  if (existingAssignment && String(existingAssignment.staffId) !== String(staffId)) {
    throw Object.assign(new Error(`Counter ${counterNumber} is already assigned to another staff member.`), { statusCode: 409 });
  }

  const assignment = await CounterAssignment.findOneAndUpdate(
    { staffId, providerId, queueDate: qDate },
    {
      $set: {
        counterNumber: String(counterNumber).trim().toUpperCase(),
        counterLabel: `Counter ${String(counterNumber).trim().toUpperCase()}`,
        status: 'assigned',
        assignedAt: new Date(),
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  if (req?.user?.userId) {
    await AuditLog.create({
      actorId: req.user.userId,
      action: 'counter.assigned',
      resource: 'counter',
      resourceId: assignment._id,
      details: { staffId, providerId, counterNumber, queueDate: qDate },
    });
  }

  return assignment;
};

/**
 * Unassign counter from staff
 */
export const unassignCounter = async ({ staffId, providerId, queueDate = new Date() }, req) => {
  const qDate = normalizeQueueDate(queueDate);

  const assignment = await CounterAssignment.findOneAndUpdate(
    { staffId, providerId, queueDate: qDate },
    {
      $set: {
        status: 'unassigned',
        unassignedAt: new Date(),
        currentAppointmentId: null,
        currentServiceStartedAt: null,
      },
    },
    { new: true },
  );

  if (!assignment) throw Object.assign(new Error('Counter assignment not found.'), { statusCode: 404 });

  if (req?.user?.userId) {
    await AuditLog.create({
      actorId: req.user.userId,
      action: 'counter.unassigned',
      resource: 'counter',
      resourceId: assignment._id,
      details: { staffId, providerId, queueDate: qDate },
    });
  }

  return assignment;
};

/**
 * Get assigned counters for a provider on a date
 */
export const getCounterAssignments = async ({ providerId, queueDate = new Date() }) => {
  if (!mongoose.isValidObjectId(providerId)) {
    throw Object.assign(new Error('Invalid provider ID.'), { statusCode: 400 });
  }

  const qDate = normalizeQueueDate(queueDate);

  const assignments = await CounterAssignment.find({
    providerId,
    queueDate: qDate,
  })
    .populate('staffId', 'name username email phone')
    .populate('currentAppointmentId', 'tokenLabel customerName')
    .sort('counterNumber')
    .lean();

  return assignments;
};

/**
 * Auto-assign available staff to counters
 */
export const autoAssignCounters = async ({ providerId, queueDate = new Date() }, req) => {
  if (!mongoose.isValidObjectId(providerId)) {
    throw Object.assign(new Error('Invalid provider ID.'), { statusCode: 400 });
  }

  const assignmentMode = await Setting.get('counter_assignment_mode', 'auto');
  if (assignmentMode !== 'auto') {
    throw Object.assign(new Error('Auto-assignment is disabled. Counter assignment mode is set to: ' + assignmentMode), { statusCode: 409 });
  }

  const qDate = normalizeQueueDate(queueDate);

  // Get all provider staff
  const provider = await Provider.findOne({ _id: providerId, isActive: true }).select('staffIds');
  if (!provider?.staffIds?.length) {
    throw Object.assign(new Error('No staff members assigned to this provider.'), { statusCode: 404 });
  }

  const staffList = await User.find({ _id: { $in: provider.staffIds }, role: 'staff', status: 'ACTIVE' }).select('_id');

  // Get existing assignments
  const existingAssignments = await CounterAssignment.find({
    providerId,
    queueDate: qDate,
    status: { $ne: 'unassigned' },
  });

  const assignedStaffIds = new Set(existingAssignments.map((a) => String(a.staffId)));

  // Auto-assign unassigned staff to available counters
  const assignments = [];
  let counterNum = 1;

  for (const staff of staffList) {
    if (assignedStaffIds.has(String(staff._id))) continue;

    const assignment = await assignCounter(
      { staffId: staff._id, providerId, counterNumber: String(counterNum), queueDate: qDate },
      req,
    );
    assignments.push(assignment);
    counterNum += 1;
  }

  return assignments;
};

/**
 * Start serving at counter
 */
export const startServingAtCounter = async ({ staffId, providerId, appointmentId, queueDate = new Date() }, req) => {
  const qDate = normalizeQueueDate(queueDate);

  const assignment = await CounterAssignment.findOneAndUpdate(
    { staffId, providerId, queueDate: qDate, status: { $in: ['assigned', 'on_break'] } },
    {
      $set: {
        status: 'serving',
        currentAppointmentId: appointmentId,
        currentServiceStartedAt: new Date(),
      },
    },
    { new: true },
  );

  if (!assignment) throw Object.assign(new Error('Counter assignment not found.'), { statusCode: 404 });

  return assignment;
};

/**
 * Complete service at counter
 */
export const completeServiceAtCounter = async ({ staffId, providerId, queueDate = new Date() }, req) => {
  const qDate = normalizeQueueDate(queueDate);

  const assignment = await CounterAssignment.findOneAndUpdate(
    { staffId, providerId, queueDate: qDate, status: 'serving' },
    {
      $set: {
        status: 'assigned',
        currentAppointmentId: null,
        currentServiceStartedAt: null,
      },
      $inc: { servicesCompletedToday: 1 },
    },
    { new: true },
  );

  if (!assignment) throw Object.assign(new Error('Counter assignment not found or not currently serving.'), { statusCode: 404 });

  return assignment;
};

/**
 * Mark counter as on break
 */
export const toggleCounterBreak = async ({ staffId, providerId, queueDate = new Date() }, req) => {
  const qDate = normalizeQueueDate(queueDate);

  const assignment = await CounterAssignment.findOne({ staffId, providerId, queueDate: qDate });
  if (!assignment) throw Object.assign(new Error('Counter assignment not found.'), { statusCode: 404 });

  const newStatus = assignment.status === 'on_break' ? 'assigned' : 'on_break';
  assignment.status = newStatus;
  await assignment.save();

  if (req?.user?.userId) {
    await AuditLog.create({
      actorId: req.user.userId,
      action: `counter.${newStatus === 'on_break' ? 'break_started' : 'break_ended'}`,
      resource: 'counter',
      resourceId: assignment._id,
    });
  }

  return assignment;
};

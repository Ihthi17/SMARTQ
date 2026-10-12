import mongoose from 'mongoose';
import { QueueSession } from './queueSession.model.js';
import {
  callNext,
  completeCurrent,
  getQueueSnapshot,
  notifyQueueChanged,
  normalizeQueueDate,
  startQueue,
  startServing,
} from './queue.service.js';
import { writeAuditLog } from '../settings/audit.service.js';

const scopeFrom = (req) => ({
  providerId: req.params.providerId || req.query.providerId || req.body?.providerId,
  branchCode: req.params.branchCode || req.query.branchCode || req.body?.branchCode,
  serviceCode: req.query.serviceCode || req.body?.serviceCode,
  queueDate: req.query.date || req.body?.date || new Date(),
});

export const getSnapshot = async (req, res, next) => {
  try {
    const scope = scopeFrom(req);
    if (!mongoose.isValidObjectId(scope.providerId)) return res.status(400).json({ message: 'providerId is required.' });
    return res.json(await getQueueSnapshot(scope));
  } catch (error) { next(error); }
};

export const start = async (req, res, next) => {
  try {
    const session = await startQueue(scopeFrom(req), req);
    await writeAuditLog(req, { action: 'queue.started', resource: 'queue', resourceId: scopeFrom(req).providerId, details: { branchCode: scopeFrom(req).branchCode, serviceCode: scopeFrom(req).serviceCode } });
    return res.json({ message: 'Queue started.', session });
  } catch (error) { next(error); }
};

export const nextToken = async (req, res, next) => {
  try {
    const appointment = await callNext(scopeFrom(req), req);
    if (appointment) await writeAuditLog(req, { action: 'queue.token_called', resource: 'appointment', resourceId: appointment._id, details: { providerId: appointment.providerId } });
    return res.json({ appointment, message: appointment ? 'Next token called.' : 'No customers are waiting.' });
  } catch (error) { next(error); }
};

export const startCurrent = async (req, res, next) => {
  try {
    const appointment = await startServing(scopeFrom(req), req);
    await writeAuditLog(req, { action: 'queue.service_started', resource: 'appointment', resourceId: appointment._id });
    return res.json({ message: 'Service started.', appointment });
  } catch (error) { next(error); }
};

export const complete = async (req, res, next) => {
  try {
    const appointment = await completeCurrent(scopeFrom(req), req);
    await writeAuditLog(req, { action: 'queue.service_completed', resource: 'appointment', resourceId: appointment._id });
    return res.json({ message: 'Service completed.', appointment });
  } catch (error) { next(error); }
};

export const pause = async (req, res, next) => {
  try {
    const scope = scopeFrom(req);
    if (!mongoose.isValidObjectId(scope.providerId)) return res.status(400).json({ message: 'providerId is required.' });
    const session = await QueueSession.findOneAndUpdate(
      { providerId: scope.providerId, queueDate: normalizeQueueDate(scope.queueDate) },
      { $set: { status: 'paused' } },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: 'Queue session not found.' });
    await writeAuditLog(req, { action: 'queue.paused', resource: 'queue', resourceId: scope.providerId, details: { branchCode: scope.branchCode, serviceCode: scope.serviceCode } });
    await notifyQueueChanged(req, scope);
    return res.json({ message: 'Queue paused.', session });
  } catch (error) { next(error); }
};

export const stop = async (req, res, next) => {
  try {
    const scope = scopeFrom(req);
    if (!mongoose.isValidObjectId(scope.providerId)) return res.status(400).json({ message: 'providerId is required.' });
    const session = await QueueSession.findOneAndDelete(
      { providerId: scope.providerId, queueDate: normalizeQueueDate(scope.queueDate) }
    );
    if (!session) return res.status(404).json({ message: 'Queue session not found.' });
    await writeAuditLog(req, { action: 'queue.stopped', resource: 'queue', resourceId: scope.providerId, details: { branchCode: scope.branchCode, serviceCode: scope.serviceCode } });
    await notifyQueueChanged(req, scope);
    return res.json({ message: 'Queue stopped and reset.', session });
  } catch (error) { next(error); }
};

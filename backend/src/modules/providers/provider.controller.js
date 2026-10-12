import mongoose from 'mongoose';
import { Provider } from './provider.model.js';
import { attachServiceCatalog } from './service.catalog.js';
import { writeAuditLog } from '../settings/audit.service.js';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const normalizeServices = (services) => {
  if (!Array.isArray(services)) throw Object.assign(new Error('Services must be a list.'), { statusCode: 400 });
  const normalized = services.map((service) => String(service).trim().toUpperCase()).filter(Boolean);
  if (normalized.some((service) => service.length > 60)) {
    throw Object.assign(new Error('Service names must be 60 characters or fewer.'), { statusCode: 400 });
  }
  return [...new Set(normalized)];
};

const normalizeWorkingHours = (hours) => {
  if (!Array.isArray(hours)) throw Object.assign(new Error('Working hours must be a list.'), { statusCode: 400 });
  const seenDays = new Set();
  return hours.map((entry) => {
    const day = String(entry?.day || '').toLowerCase();
    const isOpen = entry?.isOpen !== false;
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!entry || !WEEKDAYS.includes(day) || seenDays.has(day) || !timePattern.test(entry.start) ||
        !timePattern.test(entry.end) || (isOpen && entry.start >= entry.end)) {
      throw Object.assign(new Error(`Invalid working hours for ${day || 'provider'}.`), { statusCode: 400 });
    }
    seenDays.add(day);
    return { day, start: entry.start, end: entry.end, isOpen };
  });
};

const normalizeBranch = (branch) => {
  if (branch === undefined) return undefined;
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
    throw Object.assign(new Error('Branch details must be an object.'), { statusCode: 400 });
  }
  const rawCoordinates = branch.coordinates;
  if (!rawCoordinates || (rawCoordinates.latitude === '' && rawCoordinates.longitude === '') ||
      (rawCoordinates.latitude === undefined && rawCoordinates.longitude === undefined)) {
    const { coordinates, ...details } = branch;
    return details;
  }
  if (rawCoordinates.latitude === '' || rawCoordinates.longitude === '' ||
      rawCoordinates.latitude === undefined || rawCoordinates.longitude === undefined) {
    throw Object.assign(new Error('Enter both latitude and longitude.'), { statusCode: 400 });
  }
  const latitude = Number(rawCoordinates.latitude);
  const longitude = Number(rawCoordinates.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw Object.assign(new Error('Enter valid location coordinates (latitude -90 to 90, longitude -180 to 180).'), { statusCode: 400 });
  }
  return { ...branch, coordinates: { latitude, longitude } };
};

const normalizeServiceConfigurations = (configurations, services) => {
  if (!Array.isArray(configurations)) {
    throw Object.assign(new Error('Service requirements must be a list.'), { statusCode: 400 });
  }
  const serviceCodes = new Set(services.map((service) => service.toUpperCase()));
  const seenServices = new Set();
  return configurations.map((configuration) => {
    const serviceCode = String(configuration?.serviceCode || '').trim().toUpperCase();
    if (!serviceCodes.has(serviceCode) || seenServices.has(serviceCode) || !Array.isArray(configuration.fields)) {
      throw Object.assign(new Error('Each service requirement must belong to a unique configured service.'), { statusCode: 400 });
    }
    seenServices.add(serviceCode);
    const seenNames = new Set();
    const fields = configuration.fields.map((field) => {
      const name = String(field?.name || '').trim();
      const label = String(field?.label || '').trim();
      const type = field?.type || 'text';
      const options = field?.options ?? [];
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name) || seenNames.has(name) ||
          !label || label.length > 100 || !['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox', 'file'].includes(type) ||
          !Array.isArray(options) || options.length > 50 || (type === 'select' && options.length === 0)) {
        throw Object.assign(new Error(`Invalid intake requirement for ${serviceCode}.`), { statusCode: 400 });
      }
      seenNames.add(name);
      return { name, label, type, required: field.required === true, options: options.map((option) => String(option).trim()).filter(Boolean) };
    });
    return { serviceCode, fields };
  });
};

export const listProviders = async (req, res, next) => {
  try {
    // For queue display and public endpoints, always show only active providers
    const filter = { isActive: true };
    const providers = await Provider.find(filter).sort('name').lean();
    return res.json(await attachServiceCatalog(providers));
  } catch (error) { next(error); }
};

export const createProvider = async (req, res, next) => {
  try {
    const { name, code, type = 'provider', services = [], serviceConfigurations = [], workingHours = [], branch, avgServiceMinutes, maxQueueSize, email, phone } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ message: 'Provider name and location code are required.' });
    }
    const normalizedServices = normalizeServices(services);
    const provider = await Provider.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      type,
      services: normalizedServices,
      serviceConfigurations: normalizeServiceConfigurations(serviceConfigurations, normalizedServices),
      workingHours: normalizeWorkingHours(workingHours),
      branch: normalizeBranch(branch),
      avgServiceMinutes,
      maxQueueSize,
      email,
      phone,
    });
    await writeAuditLog(req, { action: 'provider.created', resource: 'provider', resourceId: provider._id, details: { code: provider.code } });
    return res.status(201).json(provider);
  } catch (error) { next(error); }
};

export const updateProvider = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid provider id.' });
    const allowed = ['name', 'code', 'type', 'services', 'serviceConfigurations', 'branch', 'avgServiceMinutes', 'maxQueueSize', 'email', 'phone', 'workingHours', 'staffIds', 'isActive'];
    const updates = {};
    const currentProvider = await Provider.findById(req.params.id);
    if (!currentProvider) return res.status(404).json({ message: 'Provider not found.' });
    const services = req.body.services === undefined ? currentProvider.services : normalizeServices(req.body.services);
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      updates[key] = key === 'services' ? normalizeServices(req.body[key])
        : key === 'serviceConfigurations' ? normalizeServiceConfigurations(req.body[key], services)
        : key === 'workingHours' ? normalizeWorkingHours(req.body[key])
          : key === 'branch' ? normalizeBranch(req.body[key])
        : key === 'code' ? String(req.body[key]).trim().toUpperCase()
          : req.body[key];
    }
    if (req.body.services !== undefined && req.body.serviceConfigurations === undefined) {
      const activeServices = new Set(services.map((service) => service.toUpperCase()));
      updates.serviceConfigurations = currentProvider.serviceConfigurations
        .filter((configuration) => activeServices.has(configuration.serviceCode));
    }
    const provider = await Provider.findByIdAndUpdate(req.params.id, { $set: updates }, {
      new: true, runValidators: true,
    });
    await writeAuditLog(req, { action: 'provider.updated', resource: 'provider', resourceId: provider._id, details: { fields: Object.keys(updates) } });
    return res.json(provider);
  } catch (error) { next(error); }
};

export const deactivateProvider = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid provider id.' });
    const provider = await Provider.findByIdAndUpdate(req.params.id, { $set: { isActive: false } }, { new: true });
    if (!provider) return res.status(404).json({ message: 'Provider not found.' });
    await writeAuditLog(req, { action: 'provider.deactivated', resource: 'provider', resourceId: provider._id });
    return res.json({ message: 'Provider deactivated.', provider });
  } catch (error) { next(error); }
};

import { Provider } from './provider.model.js';
import { Service } from './service.model.js';
import { Location } from '../locations/location.model.js';
import { Appointment } from '../appointments/appointment.model.js';
import { writeAuditLog } from '../settings/audit.service.js';
import { RolePermission, DEFAULT_ROLE_PERMISSIONS } from '../users/rolePermission.model.js';
import mongoose from 'mongoose';

const serviceCodePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;
const validChannels = new Set(['appointments', 'queue']);
const validFieldTypes = new Set(['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox', 'file']);

const normalizeService = (body, { creating = false } = {}) => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const code = String(body?.code || '').trim().toUpperCase();
  const providerId = String(body?.providerId || '').trim();
  const location = String(body?.location || '').trim();
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const channels = body?.channels;
  const durationMinutes = Number(body?.durationMinutes);
  // Whether the booking form requires a date/time. Defaults to true when omitted.
  const requiresDateTime = body?.requiresDateTime === undefined ? undefined : body.requiresDateTime !== false;
  if (!name || name.length > 100 || !serviceCodePattern.test(code)) {
    throw Object.assign(new Error('Enter a service name and a code containing 2–40 letters, numbers, hyphens, or underscores.'), { statusCode: 400 });
  }
  // The "Service location" dropdown sends a Location _id. For backward compatibility
  // we also accept it under `providerId`. Location is the source of truth.
  const finalLocation = location || providerId;
  if (!mongoose.isValidObjectId(finalLocation)) {
    throw Object.assign(new Error('Choose a service location for this service.'), { statusCode: 400 });
  }
  // providerId is optional now; only keep it if it is a real ObjectId
  const finalProviderId = mongoose.isValidObjectId(providerId) ? providerId : undefined;
  if (description.length > 500 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    throw Object.assign(new Error('Description must be 500 characters or fewer and duration must be between 1 and 1440 minutes.'), { statusCode: 400 });
  }
  if (!Array.isArray(channels) || channels.length === 0 || channels.some(channel => !validChannels.has(channel))) {
    throw Object.assign(new Error('Select at least one supported service channel.'), { statusCode: 400 });
  }
  const normalizedChannels = [...new Set(channels)];
  let requirements;
  if (body.requirements !== undefined) {
    if (!Array.isArray(body.requirements)) {
      throw Object.assign(new Error('Service requirements must be a list.'), { statusCode: 400 });
    }
    const seenNames = new Set();
    requirements = body.requirements.map(field => {
      const fieldName = String(field?.name || '').trim();
      const label = String(field?.label || '').trim();
      const type = field?.type || 'text';
      const options = field?.options ?? [];
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(fieldName) || seenNames.has(fieldName) ||
          !label || label.length > 100 || !validFieldTypes.has(type) || !Array.isArray(options) ||
          options.length > 50 || (type === 'select' && options.length === 0)) {
        throw Object.assign(new Error('One or more service requirements are invalid.'), { statusCode: 400 });
      }
      seenNames.add(fieldName);
      return {
        name: fieldName,
        label,
        type,
        required: field.required === true,
        options: options.map(option => String(option).trim()).filter(Boolean),
      };
    });
  }
  return {
    ...(creating ? { code } : {}),
    name,
    ...(finalProviderId ? { providerId: finalProviderId } : {}),
    location: finalLocation,
    description,
    channels: normalizedChannels,
    durationMinutes,
    // Always persist on create (default true); on update only when provided
    ...(creating ? { requiresDateTime: requiresDateTime ?? true } : (requiresDateTime !== undefined ? { requiresDateTime } : {})),
    ...(requirements ? { requirements } : {}),
  };
};

const legacyServiceEntries = async () => {
  const providers = await Provider.find({}).select('services avgServiceMinutes').lean();
  const legacy = new Map();
  for (const provider of providers) {
    for (const rawCode of provider.services || []) {
      const code = String(rawCode).trim().toUpperCase();
      if (!code) continue;
      const current = legacy.get(code) || { code, durations: [] };
      current.durations.push(Number(provider.avgServiceMinutes) || 15);
      legacy.set(code, current);
    }
  }
  return legacy;
};

const displayNameFromCode = code => code.toLowerCase().replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

export const listServices = async (req, res, next) => {
  try {
    const [saved, legacy, providers, locations] = await Promise.all([
      Service.find().populate('location', 'name code address').sort('name').lean(),
      legacyServiceEntries(),
      Provider.find({ isActive: true }).select('name code services branch').sort('name').lean(),
      Location.find({ isActive: true }).select('name code address').lean(),
    ]);
    const providersById = new Map(providers.map(provider => [String(provider._id), provider]));
    const locationsById = new Map(locations.map(loc => [String(loc._id), loc]));
    const providerForCode = code => providers.find(provider => provider.services?.some(service => String(service).toUpperCase() === code));
    const savedWithLocation = saved.map(service => {
      const provider = providersById.get(String(service.providerId)) || (!service.providerId && providerForCode(service.code));
      const loc = locationsById.get(String(service.location)) || null;
      return {
        ...service,
        providerId: provider?._id || '',
        providerName: provider?.name || '',
        providerCode: provider?.branch?.code || provider?.code || '',
        locationName: loc?.name || '',
        locationCode: loc?.code || '',
        locationAddress: loc?.address || '',
      };
    });
    const savedCodes = new Set(saved.map(service => service.code));
    const legacyRows = [...legacy.values()]
      .filter(({ code }) => !savedCodes.has(code))
      .map(({ code, durations }) => ({
        providerId: providerForCode(code)?._id || '',
        providerName: providerForCode(code)?.name || '',
        providerCode: providerForCode(code)?.branch?.code || providerForCode(code)?.code || '',
        code,
        name: displayNameFromCode(code),
        description: '',
        channels: ['appointments', 'queue'],
        durationMinutes: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
        requirements: [],
        isActive: true,
        legacy: true,
      }));
    const rolePermissions = req.user && req.user.role !== 'SUPER_ADMIN'
      ? await RolePermission.findOne({ role: req.user.role }).select('permissions').lean()
      : null;
    const canManage = req.user?.role === 'SUPER_ADMIN' ||
      (rolePermissions?.permissions ?? DEFAULT_ROLE_PERMISSIONS[req.user?.role] ?? []).includes('providers.manage');
    const services = [...savedWithLocation, ...legacyRows]
      .filter(service => canManage || service.isActive);
    return res.json(services);
  } catch (error) { next(error); }
};

// Generate a unique provider code.
const generateUniqueProviderCode = async (preferred, fallbackName) => {
  const sanitize = (value) => String(value || '').trim().toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55);
  let base = sanitize(preferred) || sanitize(fallbackName) || 'PRV';
  if (!/^[A-Z0-9]/.test(base)) base = `P-${base}`;
  if (!(await Provider.exists({ code: base }))) return base;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base}-${suffix}`.slice(0, 60);
    // eslint-disable-next-line no-await-in-loop
    if (!(await Provider.exists({ code: candidate }))) return candidate;
  }
  return `${base}-${Date.now()}`.slice(0, 60);
};

// Resolve the Provider that backs a given Location. Locations auto-create a linked
// Provider; if a legacy location has none, one is created on demand so the queue
// and appointment engines (which run on Providers) keep working.
const resolveProviderIdForLocation = async (locationDoc, explicitProviderId) => {
  if (explicitProviderId && await Provider.exists({ _id: explicitProviderId, isActive: true })) {
    return explicitProviderId;
  }
  if (locationDoc?.providerId && await Provider.exists({ _id: locationDoc.providerId, isActive: true })) {
    return locationDoc.providerId;
  }
  // Fall back to a provider sharing the location code, if any
  if (locationDoc?.code) {
    const byCode = await Provider.findOne({ code: locationDoc.code, isActive: true }).select('_id').lean();
    if (byCode) {
      if (locationDoc && !locationDoc.providerId) {
        locationDoc.providerId = byCode._id;
        await locationDoc.save().catch(() => {});
      }
      return byCode._id;
    }
  }
  // Create a backing provider on demand for legacy locations
  if (locationDoc) {
    try {
      const code = await generateUniqueProviderCode(locationDoc.code, locationDoc.name);
      const provider = await Provider.create({
        name: locationDoc.name,
        code,
        type: 'branch',
        branch: {
          name: locationDoc.name,
          code,
          address: locationDoc.address,
          coordinates: { latitude: locationDoc.lat, longitude: locationDoc.lng },
        },
        isActive: true,
      });
      locationDoc.providerId = provider._id;
      await locationDoc.save().catch(() => {});
      return provider._id;
    } catch (err) {
      console.error('resolveProviderIdForLocation create failed:', err.message);
    }
  }
  return undefined;
};

// Register a service code onto a provider's services array so the legacy queue
// engine recognizes it when creating sessions/appointments.
const registerServiceOnProvider = async (providerId, serviceCode) => {
  if (!providerId || !serviceCode) return;
  try {
    await Provider.updateOne(
      { _id: providerId },
      { $addToSet: { services: serviceCode.toUpperCase() } },
    );
  } catch (err) {
    console.error('registerServiceOnProvider failed:', err.message);
  }
};

export const createService = async (req, res, next) => {
  try {
    const payload = normalizeService(req.body, { creating: true });
    const locationDoc = await Location.findOne({ _id: payload.location, isActive: true });
    if (!locationDoc) {
      return res.status(400).json({ message: 'Choose an active location for this service.' });
    }
    // Resolve the backing Provider for this location so the queue/appointment engine works.
    const resolvedProviderId = await resolveProviderIdForLocation(locationDoc, payload.providerId);
    if (resolvedProviderId) payload.providerId = resolvedProviderId;
    const [saved, legacy] = await Promise.all([
      Service.exists({ code: payload.code }),
      Provider.exists({ services: payload.code }),
    ]);
    if (saved || legacy) return res.status(409).json({ message: 'A service with this code already exists.' });
    const service = await Service.create(payload);
    // Register the service code on the backing provider for the queue engine.
    await registerServiceOnProvider(payload.providerId, payload.code);
    await writeAuditLog(req, { action: 'service.created', resource: 'service', resourceId: service._id, details: { code: service.code, name: service.name } });
    return res.status(201).json(service);
  } catch (error) { next(error); }
};

export const updateService = async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!serviceCodePattern.test(code)) return res.status(400).json({ message: 'Invalid service code.' });
    const service = await Service.findOne({ code });
    const legacyExists = service ? false : await Provider.exists({ services: code });
    if (!service && !legacyExists) return res.status(404).json({ message: 'Service not found.' });

    if (req.body?.isActive !== undefined && typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ message: 'Service status must be active or inactive.' });
    }
    // The "Service location" dropdown value arrives as providerId from the client,
    // but it is actually a Location _id. Location is the source of truth.
    const incomingLocation = req.body?.location || req.body?.providerId || service?.location;
    
    // When deactivating, ensure location is specified
    const isDeactivating = req.body?.isActive === false;
    if (isDeactivating && !incomingLocation) {
      return res.status(400).json({ message: 'Choose a service location for this service before deactivating it.' });
    }
    
    const updates = normalizeService({
      ...req.body,
      code,
      // Preserve any legacy providerId already stored; do not force the dropdown value into it
      providerId: service?.providerId,
      location: incomingLocation,
      name: req.body?.name || service?.name || displayNameFromCode(code),
      durationMinutes: req.body?.durationMinutes ?? service?.durationMinutes ?? 15,
      channels: req.body?.channels ?? service?.channels ?? ['appointments', 'queue'],
    });
    
    const locationDoc = await Location.findById(updates.location);
    if (!locationDoc && !isDeactivating) {
      return res.status(400).json({ message: 'Choose an active location for this service.' });
    }
    
    if (locationDoc) {
      const resolvedProviderId = await resolveProviderIdForLocation(locationDoc, updates.providerId);
      if (resolvedProviderId) updates.providerId = resolvedProviderId;
    }
    if (req.body?.isActive !== undefined) updates.isActive = req.body.isActive;
    const saved = service
      ? await Service.findOneAndUpdate({ code }, { $set: updates }, { new: true, runValidators: true })
      : await Service.create({ code, ...updates, isActive: updates.isActive ?? true });
    await registerServiceOnProvider(updates.providerId, code);
    await writeAuditLog(req, { action: 'service.updated', resource: 'service', resourceId: saved._id, details: { code, fields: Object.keys(updates) } });
    return res.json(saved);
  } catch (error) { next(error); }
};

export const deleteService = async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!serviceCodePattern.test(code)) return res.status(400).json({ message: 'Invalid service code.' });
    
    const service = await Service.findOne({ code });
    if (!service) return res.status(404).json({ message: 'Service not found.' });
    
    // Check if there are active appointments for this service
    const activeAppointments = await Appointment.countDocuments({
      serviceCode: code,
      status: { $nin: ['cancelled', 'no_show', 'completed'] }
    });
    
    if (activeAppointments > 0) {
      return res.status(409).json({ 
        message: `Cannot delete service with ${activeAppointments} active appointment(s). Deactivate the service instead or cancel the appointments first.` 
      });
    }
    
    // Remove service from provider's services array
    if (service.providerId) {
      await Provider.updateOne(
        { _id: service.providerId },
        { $pull: { services: code } }
      );
    }
    
    // Delete the service
    await Service.deleteOne({ code });
    await writeAuditLog(req, { action: 'service.deleted', resource: 'service', resourceId: service._id, details: { code, name: service.name } });
    
    return res.json({ message: 'Service deleted successfully.' });
  } catch (error) { next(error); }
};

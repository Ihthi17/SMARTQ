import { Location } from './location.model.js';
import { Service } from '../providers/service.model.js';
import { Appointment } from '../appointments/appointment.model.js';
import { Provider } from '../providers/provider.model.js';
import { writeAuditLog } from '../settings/audit.service.js';

// Build a URL/code-safe base string from the given value
const sanitizeCodeBase = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 50);

// Generate a unique location code. If `preferred` is taken (e.g. same city code),
// a numeric suffix is appended so multiple locations can share the same base code.
const generateUniqueLocationCode = async (preferred, fallbackName) => {
  let base = sanitizeCodeBase(preferred) || sanitizeCodeBase(fallbackName) || 'LOC';
  if (!/^[A-Z0-9]/.test(base)) base = `L-${base}`;
  base = base.slice(0, 55); // leave room for a suffix

  // Try the base code first
  if (!(await Location.exists({ code: base }))) return base;

  // Otherwise append -2, -3, ... until a free code is found
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base}-${suffix}`.slice(0, 60);
    // eslint-disable-next-line no-await-in-loop
    if (!(await Location.exists({ code: candidate }))) return candidate;
  }
  // Extremely unlikely fallback
  return `${base}-${Date.now()}`.slice(0, 60);
};

// Generate a unique provider code (providers also require a unique code).
const generateUniqueProviderCode = async (preferred, fallbackName) => {
  let base = sanitizeCodeBase(preferred) || sanitizeCodeBase(fallbackName) || 'PRV';
  if (!/^[A-Z0-9]/.test(base)) base = `P-${base}`;
  base = base.slice(0, 55);
  if (!(await Provider.exists({ code: base }))) return base;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base}-${suffix}`.slice(0, 60);
    // eslint-disable-next-line no-await-in-loop
    if (!(await Provider.exists({ code: candidate }))) return candidate;
  }
  return `${base}-${Date.now()}`.slice(0, 60);
};

// Create (or reuse) a Provider that mirrors a Location. The queue and appointment
// engines operate on Providers, so every Location needs a backing Provider.
const ensureProviderForLocation = async (location) => {
  try {
    // Reuse an existing provider already linked to this location
    if (location.providerId) {
      const existing = await Provider.findById(location.providerId);
      if (existing) return existing;
    }
    const code = await generateUniqueProviderCode(location.code, location.name);
    const provider = await Provider.create({
      name: location.name,
      code,
      type: 'branch',
      branch: {
        name: location.name,
        code,
        address: location.address,
        coordinates: { latitude: location.lat, longitude: location.lng },
      },
      isActive: true,
    });
    return provider;
  } catch (err) {
    console.error('ensureProviderForLocation failed:', err.message);
    return null;
  }
};

// POST /api/locations — create a new location
export const createLocation = async (req, res, next) => {
  try {
    const { name, code, address, placeId, lat, lng, radiusMeters } = req.body;

    // Validation — code is optional; it will be auto-generated/uniquified
    if (!name || !address || lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'name, address, lat, and lng are required' });
    }

    if (typeof lat !== 'number' || lat < -90 || lat > 90) {
      return res.status(400).json({ message: 'lat must be a number between -90 and 90' });
    }

    if (typeof lng !== 'number' || lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'lng must be a number between -180 and 180' });
    }

    // Generate a guaranteed-unique code. Admins may supply a shared city/postal code
    // (e.g. 61300) and we append a suffix automatically to keep it unique internally.
    const uniqueCode = await generateUniqueLocationCode(code, name);

    const location = new Location({
      name: name.trim(),
      code: uniqueCode,
      address: address.trim(),
      placeId: placeId?.trim() || null,
      lat,
      lng,
      radiusMeters: radiusMeters || 200,
    });

    await location.save();

    // Auto-create a matching Provider so the queue/appointment engine (which runs on
    // Providers) works for services assigned to this location. Link them both ways.
    const provider = await ensureProviderForLocation(location);
    if (provider) {
      location.providerId = provider._id;
      await location.save();
    }

    await writeAuditLog(req, {
      action: 'location.created',
      resource: 'location',
      resourceId: location._id.toString(),
      details: { name: location.name, code: location.code, lat, lng },
    });

    return res.status(201).json(location);
  } catch (err) {
    next(err);
  }
};

// GET /api/locations — list all active locations
export const listLocations = async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const filter = includeInactive ? {} : { isActive: true };
    const locations = await Location.find(filter).sort('-createdAt');
    return res.json(locations);
  } catch (err) {
    next(err);
  }
};

// GET /api/locations/:id — get a single location
export const getLocation = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }
    return res.json(location);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/locations/:id — update a location
export const updateLocation = async (req, res, next) => {
  try {
    const { name, code, address, placeId, lat, lng, radiusMeters } = req.body;
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    // If the code changed and now collides with another location, auto-uniquify it
    // instead of rejecting (e.g. two branches sharing the same city/postal code).
    let resolvedCode;
    if (code && code.toUpperCase() !== location.code) {
      const existing = await Location.findOne({ code: code.toUpperCase(), _id: { $ne: location._id } });
      resolvedCode = existing
        ? await generateUniqueLocationCode(code, location.name)
        : sanitizeCodeBase(code);
    }

    if (lat !== undefined && (typeof lat !== 'number' || lat < -90 || lat > 90)) {
      return res.status(400).json({ message: 'lat must be a number between -90 and 90' });
    }

    if (lng !== undefined && (typeof lng !== 'number' || lng < -180 || lng > 180)) {
      return res.status(400).json({ message: 'lng must be a number between -180 and 180' });
    }

    // Update fields
    if (name) location.name = name.trim();
    if (resolvedCode) location.code = resolvedCode;
    if (address) location.address = address.trim();
    if (placeId) location.placeId = placeId.trim();
    if (lat !== undefined) location.lat = lat;
    if (lng !== undefined) location.lng = lng;
    if (radiusMeters !== undefined) location.radiusMeters = radiusMeters;

    await location.save();
    await writeAuditLog(req, {
      action: 'location.updated',
      resource: 'location',
      resourceId: location._id.toString(),
      details: { name: location.name, code: location.code },
    });

    return res.json(location);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/locations/:id/activate — activate a location
export const activateLocation = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    if (location.isActive) {
      return res.status(400).json({ message: 'Location is already active' });
    }

    location.isActive = true;
    await location.save();

    await writeAuditLog(req, {
      action: 'location.activated',
      resource: 'location',
      resourceId: location._id.toString(),
      details: { name: location.name },
    });

    return res.json(location);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/locations/:id/deactivate — deactivate a location
export const deactivateLocation = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    if (!location.isActive) {
      return res.status(400).json({ message: 'Location is already inactive' });
    }

    // Check if location has active services
    const activeServices = await Service.findOne({
      location: location._id,
      isActive: true,
    });

    if (activeServices) {
      return res.status(409).json({
        message: 'Cannot deactivate location with active services. Deactivate services first.',
      });
    }

    // Check if location has future confirmed appointments
    const futureAppointments = await Appointment.findOne({
      location: location._id,
      status: 'confirmed',
      scheduledStart: { $gt: new Date() },
    });

    if (futureAppointments) {
      return res.status(409).json({
        message: 'Cannot deactivate location with future confirmed appointments. Cancel or complete them first.',
      });
    }

    location.isActive = false;
    await location.save();

    await writeAuditLog(req, {
      action: 'location.deactivated',
      resource: 'location',
      resourceId: location._id.toString(),
      details: { name: location.name },
    });

    return res.json(location);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/locations/:id — permanently delete a location.
// Blocked only when there are in-progress queue appointments (active work).
// Dependent services are deactivated (not deleted) so historical records stay intact.
export const deleteLocation = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    // Block deletion only if customers are actively in the queue right now.
    const activeAppointment = await Appointment.findOne({
      location: location._id,
      status: { $in: ['queued', 'called', 'in_service'] },
    });
    if (activeAppointment) {
      return res.status(409).json({
        message: 'Cannot delete: there are customers currently in the queue for this location. Complete or cancel them first.',
      });
    }

    // Deactivate any services assigned to this location so they can't be booked.
    const servicesResult = await Service.updateMany(
      { location: location._id, isActive: true },
      { $set: { isActive: false } },
    );

    // Permanently remove the location.
    await Location.deleteOne({ _id: location._id });

    await writeAuditLog(req, {
      action: 'location.deleted',
      resource: 'location',
      resourceId: location._id.toString(),
      details: { name: location.name, code: location.code, servicesDeactivated: servicesResult.modifiedCount },
    });

    return res.json({
      message: `Location "${location.name}" deleted.${servicesResult.modifiedCount ? ` ${servicesResult.modifiedCount} service(s) were deactivated.` : ''}`,
    });
  } catch (err) {
    next(err);
  }
};

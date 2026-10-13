import { writeAuditLog } from '../settings/audit.service.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_DEFINITIONS, RolePermission } from './rolePermission.model.js';
import { User } from './user.model.js';

const builtInRoles = [
  { role: 'admin', label: 'Admin', systemRole: true },
  { role: 'staff', label: 'Staff', systemRole: true },
];

const roleSlug = (label) => `custom_${label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

const serializeRoles = async () => {
  const savedRoles = await RolePermission.find().sort('label').lean();
  const savedByRole = new Map(savedRoles.map((item) => [item.role, item]));
  const roles = builtInRoles.map(({ role, label, systemRole }) => {
    const saved = savedByRole.get(role);
    return {
      role,
      label,
      systemRole,
      permissions: saved?.permissions ?? DEFAULT_ROLE_PERMISSIONS[role],
    };
  });
  const customRoles = savedRoles
    .filter((item) => item.role.startsWith('custom_'))
    .map(({ role, label, permissions, systemRole }) => ({ role, label, systemRole: Boolean(systemRole), permissions }));
  return [...roles, ...customRoles];
};

export const listAssignableRoles = async (_req, res, next) => {
  try {
    return res.json({ roles: await serializeRoles() });
  } catch (error) { next(error); }
};

export const getRolePermissions = async (_req, res, next) => {
  try {
    return res.json({
      roles: await serializeRoles(),
      definitions: PERMISSION_DEFINITIONS,
    });
  } catch (error) { next(error); }
};

export const getCurrentPermissions = async (req, res, next) => {
  try {
    if (req.user.role === 'SUPER_ADMIN') {
      return res.json({ role: req.user.role, permissions: PERMISSION_DEFINITIONS.map(({ key }) => key) });
    }
    const saved = await RolePermission.findOne({ role: req.user.role }).lean();
    return res.json({
      role: req.user.role,
      permissions: saved?.permissions ?? DEFAULT_ROLE_PERMISSIONS[req.user.role] ?? [],
    });
  } catch (error) { next(error); }
};

export const updateRolePermissions = async (req, res, next) => {
  try {
    const { role, permissions } = req.body || {};
    if (!builtInRoles.some((item) => item.role === role) && !/^custom_[a-z0-9_]+$/.test(role || '')) {
      return res.status(400).json({ message: 'Choose an existing assignable role.' });
    }
    if (role.startsWith('custom_') && !await RolePermission.exists({ role, systemRole: false })) {
      return res.status(404).json({ message: 'Custom role not found.' });
    }
    const available = new Set(PERMISSION_DEFINITIONS.map(({ key }) => key));
    if (!Array.isArray(permissions) || permissions.some((permission) => !available.has(permission))) {
      return res.status(400).json({ message: 'Permissions must be a list of supported permission keys.' });
    }
    const normalizedPermissions = [...new Set(permissions)];
    const saved = await RolePermission.findOneAndUpdate(
      { role },
      { $set: { permissions: normalizedPermissions, updatedBy: req.user.userId }, $setOnInsert: { label: builtInRoles.find((item) => item.role === role)?.label || role.replace(/^custom_/, '').replaceAll('_', ' '), systemRole: builtInRoles.some((item) => item.role === role) } },
      { new: true, upsert: true, runValidators: true },
    );
    await writeAuditLog(req, {
      action: 'role.permissions_updated',
      resource: 'role',
      details: { role, permissions: normalizedPermissions },
    });
    return res.json({ role: saved.role, label: saved.label, permissions: saved.permissions });
  } catch (error) { next(error); }
};

export const createRole = async (req, res, next) => {
  try {
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (label.length < 2 || label.length > 80) {
      return res.status(400).json({ message: 'Role name must be between 2 and 80 characters.' });
    }
    const role = roleSlug(label);
    if (!/^custom_[a-z0-9_]{2,60}$/.test(role)) {
      return res.status(400).json({ message: 'Role name must contain at least two letters or numbers.' });
    }
    const exists = await RolePermission.exists({ $or: [{ role }, { label: { $regex: `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }] });
    if (exists || builtInRoles.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      return res.status(409).json({ message: 'A role with this name already exists.' });
    }
    const created = await RolePermission.create({
      role,
      label,
      systemRole: false,
      permissions: [],
      updatedBy: req.user.userId,
    });
    await writeAuditLog(req, { action: 'role.created', resource: 'role', details: { role, label } });
    return res.status(201).json({ role: created.role, label: created.label, systemRole: false, permissions: created.permissions });
  } catch (error) { next(error); }
};

export const updateRole = async (req, res, next) => {
  try {
    const { role } = req.params;
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (label.length < 2 || label.length > 80) {
      return res.status(400).json({ message: 'Role name must be between 2 and 80 characters.' });
    }
    const savedRole = await RolePermission.findOne({ role, systemRole: false });
    if (!savedRole) return res.status(404).json({ message: 'Custom role not found.' });
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicate = await RolePermission.exists({
      role: { $ne: role },
      label: { $regex: `^${escapedLabel}$`, $options: 'i' },
    });
    if (duplicate || builtInRoles.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      return res.status(409).json({ message: 'A role with this name already exists.' });
    }
    savedRole.label = label;
    savedRole.updatedBy = req.user.userId;
    await savedRole.save();
    await writeAuditLog(req, { action: 'role.updated', resource: 'role', details: { role, label } });
    return res.json({ role: savedRole.role, label: savedRole.label, permissions: savedRole.permissions });
  } catch (error) { next(error); }
};

export const deleteRole = async (req, res, next) => {
  try {
    const { role } = req.params;
    const savedRole = await RolePermission.findOne({ role, systemRole: false });
    if (!savedRole) return res.status(404).json({ message: 'Custom role not found.' });
    const assignedUsers = await User.countDocuments({ role });
    if (assignedUsers > 0) {
      return res.status(409).json({ message: `This role is assigned to ${assignedUsers} user(s). Reassign those users before deleting the role.` });
    }
    await savedRole.deleteOne();
    await writeAuditLog(req, { action: 'role.deleted', resource: 'role', details: { role, label: savedRole.label } });
    return res.json({ message: 'Role deleted.' });
  } catch (error) { next(error); }
};

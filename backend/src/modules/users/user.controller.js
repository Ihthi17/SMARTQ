import { User } from './user.model.js';
import { RolePermission } from './rolePermission.model.js';
import { writeAuditLog } from '../settings/audit.service.js';

const validateAssignableRole = async (role) => {
  if (['SUPER_ADMIN', 'admin', 'staff'].includes(role)) return true;
  if (!/^custom_[a-z0-9_]+$/.test(role || '')) return false;
  return Boolean(await RolePermission.exists({ role }));
};

// ── GET /api/users/me ─────────────────────────────────────────────
export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) { next(err); }
};

// ── PATCH /api/users/me ───────────────────────────────────────────
export const updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'email', 'phone', 'notificationPreferences'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true, runValidators: true },
    );
    return res.json(user);
  } catch (err) { next(err); }
};

// ── PATCH /api/users/me/password ──────────────────────────────────
export const updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword)
      return res.status(400).json({ message: 'oldPassword and newPassword are required' });
    if (newPassword.length < 8)
      return res.status(400).json({ message: 'New password must be at least 8 characters' });

    const user = await User.findById(req.user.userId).select('+password +refreshTokenHash');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ok = await user.comparePassword(oldPassword);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await user.save();
    await user.clearRefreshToken();
    return res.json({ message: 'Password updated. Please log in again.' });
  } catch (err) { next(err); }
};

// ── GET /api/users  (admin) ───────────────────────────────────────
export const listUsers = async (req, res, next) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role)   filter.role   = role;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(Number(limit)).sort('-createdAt'),
      User.countDocuments(filter),
    ]);
    return res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
};

// ── GET /api/users/:id  (admin) ───────────────────────────────────
export const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) { next(err); }
};

// ── POST /api/users  (admin) ──────────────────────────────────────
export const createUser = async (req, res, next) => {
  try {
    const { name, username, email, password, role, phone, status } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: 'username, email and password are required' });
    if (!await validateAssignableRole(role || 'staff')) {
      return res.status(400).json({ message: 'Choose an existing assignable role.' });
    }
    if (role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only a super admin can create another super admin.' });
    }
    const user = await User.create({ name, username, email, password, role, phone, status, mustChangePassword: true });
    await writeAuditLog(req, { action: 'user.created', resource: 'user', resourceId: user._id, details: { role: user.role } });
    return res.status(201).json(user);
  } catch (err) { next(err); }
};

// ── PATCH /api/users/:id  (admin) ─────────────────────────────────
export const updateUser = async (req, res, next) => {
  try {
    const allowed = ['name', 'email', 'phone', 'role', 'status', 'notificationPreferences'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const user = await User.findById(req.params.id).select('+password +refreshTokenHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only a super admin can edit this account.' });
    }
    if (updates.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only a super admin can assign the super admin role.' });
    }
    if (updates.role && !await validateAssignableRole(updates.role)) {
      return res.status(400).json({ message: 'Choose an existing assignable role.' });
    }
    if (String(user._id) === String(req.user.userId) &&
        ((updates.role && updates.role !== user.role) || (updates.status && updates.status !== 'ACTIVE'))) {
      return res.status(400).json({ message: 'You cannot remove your own account access.' });
    }
    Object.assign(user, updates);
    if (updates.status && updates.status !== 'ACTIVE') user.refreshTokenHash = null;
    if (req.body.password !== undefined && req.body.password !== '') {
      if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
        return res.status(400).json({ message: 'Temporary password must be at least 8 characters.' });
      }
      user.password = req.body.password;
      user.mustChangePassword = true;
      user.passwordChangedAt = new Date();
      user.refreshTokenHash = null;
    }
    await user.save();
    await writeAuditLog(req, { action: 'user.updated', resource: 'user', resourceId: user._id, details: { fields: Object.keys(updates) } });
    return res.json(user);
  } catch (err) { next(err); }
};

export const unlockUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only a super admin can unlock this account.' });
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.status = 'ACTIVE';
    await user.save();
    await writeAuditLog(req, { action: 'user.unlocked', resource: 'user', resourceId: user._id });
    return res.json({ message: 'User unlocked.', user });
  } catch (error) { next(error); }
};

// ── DELETE /api/users/:id  (admin) ────────────────────────────────
export const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === String(req.user.userId))
      return res.status(400).json({ message: 'Cannot delete your own account' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only a super admin can delete this account.' });
    }
    await user.deleteOne();
    await writeAuditLog(req, { action: 'user.deleted', resource: 'user', resourceId: user._id });
    return res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
};

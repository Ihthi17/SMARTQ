import { verifyToken } from '../config/jwt.js';
import User from '../modules/auth/auth.model.js';
import { DEFAULT_ROLE_PERMISSIONS, RolePermission } from '../modules/users/rolePermission.model.js';

export const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
    const token = auth.split(' ')[1];
    const payload = verifyToken(token);
    const user = await User.findById(payload.userId);
    if (!user || user.status !== 'ACTIVE') return res.status(401).json({ message: 'Unauthorized' });
    req.user = { userId: user._id, username: user.username, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

export const optionalProtect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyToken(auth.slice(7));
    const user = await User.findById(payload.userId);
    if (user?.status === 'ACTIVE') req.user = { userId: user._id, username: user.username, role: user.role };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid authorization token' });
  }
};

export const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

export const authorizePermission = (permission) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (req.user.role === 'SUPER_ADMIN') return next();
  try {
    const rolePermissions = await RolePermission.findOne({ role: req.user.role }).lean();
    const allowed = rolePermissions?.permissions ?? DEFAULT_ROLE_PERMISSIONS[req.user.role] ?? [];
    if (!allowed.includes(permission)) return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    return next();
  } catch (error) {
    return next(error);
  }
};

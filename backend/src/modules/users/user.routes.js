import { Router } from 'express';
import { protect, authorizeRoles, authorizePermission } from '../../middlewares/auth.middleware.js';
import {
  getProfile,
  updateProfile,
  updatePassword,
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  unlockUser,
} from './user.controller.js';
import {
  createRole,
  deleteRole,
  getCurrentPermissions,
  getRolePermissions,
  listAssignableRoles,
  updateRole,
  updateRolePermissions,
} from './rolePermission.controller.js';

const router = Router();
const viewUsers = [protect, authorizePermission('users.view')];
const manageUsers = [protect, authorizePermission('users.manage')];

// ── Own profile ───────────────────────────────────────────────────
router.get('/me',              protect, getProfile);
router.patch('/me',            protect, updateProfile);
router.patch('/me/password',   protect, updatePassword);
router.get('/permissions', protect, getCurrentPermissions);
router.get('/roles', protect, authorizePermission('users.view'), listAssignableRoles);
router.post('/roles', protect, authorizeRoles('SUPER_ADMIN'), createRole);
router.patch('/roles/:role', protect, authorizeRoles('SUPER_ADMIN'), updateRole);
router.delete('/roles/:role', protect, authorizeRoles('SUPER_ADMIN'), deleteRole);
router.get('/role-permissions', protect, authorizeRoles('SUPER_ADMIN'), getRolePermissions);
router.put('/role-permissions', protect, authorizeRoles('SUPER_ADMIN'), updateRolePermissions);

// ── Admin CRUD ────────────────────────────────────────────────────
router.get('/',                ...viewUsers, listUsers);
router.post('/',               ...manageUsers, createUser);
router.get('/:id',             ...viewUsers, getUser);
router.patch('/:id/unlock',    ...manageUsers, unlockUser);
router.patch('/:id',           ...manageUsers, updateUser);
router.delete('/:id',          ...manageUsers, deleteUser);

export default router;

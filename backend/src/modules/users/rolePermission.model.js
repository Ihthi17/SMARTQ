import mongoose from 'mongoose';

export const PERMISSION_DEFINITIONS = [
  { key: 'appointments.view', label: 'View appointments', category: 'Appointments' },
  { key: 'appointments.manage', label: 'Create, prioritize, and cancel appointments', category: 'Appointments' },
  { key: 'queue.view', label: 'View live queue', category: 'Queue' },
  { key: 'queue.manage', label: 'Control queue operations', category: 'Queue' },
  { key: 'providers.view', label: 'View services and locations', category: 'Services' },
  { key: 'providers.manage', label: 'Create and edit services and locations', category: 'Services' },
  { key: 'users.view', label: 'View user accounts', category: 'Users' },
  { key: 'users.manage', label: 'Create, edit, deactivate, and delete users', category: 'Users' },
  { key: 'settings.view', label: 'View system settings and audit logs', category: 'Settings' },
  { key: 'settings.manage', label: 'Change settings and manage backups', category: 'Settings' },
];

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: PERMISSION_DEFINITIONS.map(({ key }) => key),
  staff: ['appointments.view', 'appointments.manage', 'queue.view', 'queue.manage'],
  customer: [],
};

const rolePermissionSchema = new mongoose.Schema({
  role: { type: String, required: true, unique: true, match: /^(admin|staff|customer|custom_[a-z0-9_]+)$/ },
  label: { type: String, required: true, trim: true, maxlength: 80 },
  systemRole: { type: Boolean, default: false },
  permissions: [{ type: String, enum: PERMISSION_DEFINITIONS.map(({ key }) => key) }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { collection: 'role_permissions', timestamps: true });

export const RolePermission = mongoose.models.RolePermission ||
  mongoose.model('RolePermission', rolePermissionSchema);

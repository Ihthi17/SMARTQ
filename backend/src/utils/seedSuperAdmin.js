import User from '../modules/auth/auth.model.js';

export const seedSuperAdmin = async () => {
  try {
    const existing = await User.findOne({ username: 'superadmin' });
    if (existing) {
      console.log('[SEED] Super admin user already exists with status:', existing.status);
      if (existing.role !== 'SUPER_ADMIN') {
        await User.updateOne(
          { _id: existing._id },
          { $set: { role: 'SUPER_ADMIN' } },
          { runValidators: true },
        );
        console.log('[SEED] Updated existing user to SUPER_ADMIN role');
      }
      return;
    }

    const u = new User({
      username: 'superadmin',
      name: 'Super Admin',
      email: 'admin@smartqueue.com',
      password: 'ChangeMe@123',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    const saved = await u.save();
    console.log('[SEED] Seeded superadmin → username: superadmin / password: ChangeMe@123 / saved ID:', saved._id);
  } catch (err) {
    console.error('[SEED ERROR] Failed to seed super admin:', err.message);
    throw err;
  }
};

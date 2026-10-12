import User from '../src/modules/auth/auth.model.js';
import { RolePermission } from '../src/modules/users/rolePermission.model.js';

describe('Custom role schemas', () => {
  test('user schema accepts a custom role identifier', () => {
    const user = new User({
      username: 'reception',
      email: 'reception@example.com',
      password: 'temporary-password',
      role: 'custom_reception_manager',
    });
    expect(user.validateSync()?.errors?.role).toBeUndefined();
  });

  test('user schema rejects malformed custom role identifiers', () => {
    const user = new User({
      username: 'reception',
      email: 'reception@example.com',
      password: 'temporary-password',
      role: 'custom_Invalid role',
    });
    expect(user.validateSync().errors.role).toBeDefined();
  });

  test('permission schema accepts registered permissions on custom roles', () => {
    const role = new RolePermission({
      role: 'custom_reception_manager',
      label: 'Reception Manager',
      permissions: ['appointments.view', 'queue.view'],
    });
    expect(role.validateSync()).toBeUndefined();
  });
});

import { jest } from '@jest/globals';

const setSetting = jest.fn();
const writeAuditLog = jest.fn();

jest.unstable_mockModule('../src/modules/settings/setting.model.js', () => ({
  Setting: { set: setSetting },
}));
jest.unstable_mockModule('../src/modules/settings/settings.seed.js', () => ({
  settingsDefaults: [
    { key: 'appointment_max_daily', value: 100 },
    { key: 'appointment_auto_cancel', value: false },
  ],
}));
jest.unstable_mockModule('../src/modules/notifications/email.service.js', () => ({
  getTransporter: jest.fn(),
}));
jest.unstable_mockModule('../src/modules/settings/auditLog.model.js', () => ({
  AuditLog: {},
}));
jest.unstable_mockModule('../src/modules/settings/audit.service.js', () => ({
  writeAuditLog,
}));
jest.unstable_mockModule('../src/modules/notifications/sms.service.js', () => ({
  sendSms: jest.fn(),
  sendWhatsApp: jest.fn(),
}));
jest.unstable_mockModule('../src/modules/settings/backup.service.js', () => ({
  createDatabaseBackup: jest.fn(),
  getDatabaseBackupPath: jest.fn(),
  listDatabaseBackups: jest.fn(),
  restoreDatabaseBackup: jest.fn(),
}));

const { updateSettings } = await import('../src/modules/settings/settings.controller.js');

describe('settings updates', () => {
  beforeEach(() => {
    setSetting.mockReset();
    writeAuditLog.mockReset();
    setSetting.mockResolvedValue(undefined);
    writeAuditLog.mockResolvedValue(undefined);
  });

  test('persists numeric input values and boolean toggle changes', async () => {
    const req = {
      body: {
        updates: [
          { key: 'appointment_max_daily', value: 2 },
          { key: 'appointment_auto_cancel', value: true },
        ],
      },
      user: { userId: 'admin-id' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await updateSettings(req, res, jest.fn());

    expect(setSetting).toHaveBeenNthCalledWith(1, 'appointment_max_daily', 2, { updatedBy: 'admin-id' });
    expect(setSetting).toHaveBeenNthCalledWith(2, 'appointment_auto_cancel', true, { updatedBy: 'admin-id' });
    expect(setSetting).toHaveBeenNthCalledWith(3, 'appointment_auto_cancel_configured', true, {
      updatedBy: 'admin-id',
      group: 'internal',
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Settings saved' });
  });

  test('rejects invalid numeric setting values instead of reporting a save', async () => {
    const req = {
      body: { updates: [{ key: 'appointment_max_daily', value: 2.5 }] },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await updateSettings(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid value for setting: appointment_max_daily' });
    expect(setSetting).not.toHaveBeenCalled();
  });
});

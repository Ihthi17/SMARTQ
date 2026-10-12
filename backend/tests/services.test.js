import { Service } from '../src/modules/providers/service.model.js';
import mongoose from 'mongoose';

describe('Service catalog schema', () => {
  test('accepts catalog services with customer channels and requirements', () => {
    const service = new Service({
      code: 'MEDICAL001',
      name: 'Medical',
      providerId: new mongoose.Types.ObjectId(),
      channels: ['appointments', 'queue'],
      durationMinutes: 15,
      requirements: [{ name: 'visitReason', label: 'Visit reason', type: 'text', required: true }],
    });
    expect(service.validateSync()).toBeUndefined();
    expect(service.isActive).toBe(true);
  });

  test('rejects invalid service codes, durations, and channels', () => {
    const service = new Service({
      code: 'invalid code',
      name: 'Medical',
      providerId: new mongoose.Types.ObjectId(),
      channels: ['unsupported'],
      durationMinutes: 0,
    });
    const errors = service.validateSync().errors;
    expect(errors.code).toBeDefined();
    expect(errors['channels.0']).toBeDefined();
    expect(errors.durationMinutes).toBeDefined();
  });

  test('requires every service to be assigned to a location', () => {
    const service = new Service({ code: 'MEDICAL001', name: 'Medical' });
    expect(service.validateSync().errors.providerId).toBeDefined();
  });
});

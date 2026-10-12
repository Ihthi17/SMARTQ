import { jest } from '@jest/globals';

const countDocuments = jest.fn();
const getSetting = jest.fn();

jest.unstable_mockModule('../src/modules/appointments/appointment.model.js', () => ({
  Appointment: { countDocuments },
}));
jest.unstable_mockModule('../src/modules/settings/setting.model.js', () => ({
  Setting: { get: getSetting },
}));

const {
  enforceCustomerAppointmentLimit,
  enforceDailyAppointmentLimit,
} = await import('../src/modules/appointments/appointment-limits.service.js');

describe('appointment setting limits', () => {
  const queueDate = new Date('2026-10-07T00:00:00.000Z');

  beforeEach(() => {
    countDocuments.mockReset();
    getSetting.mockReset();
  });

  test('daily limit counts appointments across providers and rejects the next booking', async () => {
    getSetting.mockResolvedValue(2);
    countDocuments.mockResolvedValue(2);

    await expect(enforceDailyAppointmentLimit({ queueDate })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(countDocuments).toHaveBeenCalledWith({
      queueDate,
      status: { $nin: ['cancelled', 'no_show'] },
    });
  });

  test('daily limit permits the booking below the configured maximum', async () => {
    getSetting.mockResolvedValue(2);
    countDocuments.mockResolvedValue(1);

    await expect(enforceDailyAppointmentLimit({ queueDate })).resolves.toBeUndefined();
  });

  test('per-customer limit counts the customer across providers and normalizes email', async () => {
    getSetting.mockResolvedValue(2);
    countDocuments.mockResolvedValue(2);

    await expect(enforceCustomerAppointmentLimit({
      queueDate,
      customerEmail: '  CUSTOMER@example.com ',
      customerPhone: '5550100',
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(countDocuments).toHaveBeenCalledWith({
      queueDate,
      $or: [
        { customerEmail: 'customer@example.com' },
        { customerPhone: '5550100' },
      ],
      status: { $nin: ['cancelled', 'no_show'] },
    });
  });

  test('a zero limit remains unlimited', async () => {
    getSetting.mockResolvedValue(0);

    await expect(enforceDailyAppointmentLimit({ queueDate })).resolves.toBeUndefined();
    expect(countDocuments).not.toHaveBeenCalled();
  });

  test('excludes the appointment being rescheduled from its own daily count', async () => {
    getSetting.mockResolvedValue(2);
    countDocuments.mockResolvedValue(1);
    const appointmentId = 'appointment-id';

    await expect(enforceDailyAppointmentLimit({
      queueDate,
      excludeAppointmentId: appointmentId,
    })).resolves.toBeUndefined();
    expect(countDocuments).toHaveBeenCalledWith({
      queueDate,
      status: { $nin: ['cancelled', 'no_show'] },
      _id: { $ne: appointmentId },
    });
  });
});

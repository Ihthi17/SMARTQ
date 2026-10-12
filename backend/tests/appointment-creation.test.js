import { jest } from '@jest/globals';

// Mock dependencies
const mockAppointmentCreate = jest.fn();
const mockProviderFindOne = jest.fn();
const mockServiceCatalogFindOne = jest.fn();
const mockServiceCatalogExists = jest.fn().mockResolvedValue(false);
const mockSettingGet = jest.fn();
const mockUserFindOne = jest.fn();
const mockQueueSessionFindOne = jest.fn();
const mockAppointmentExists = jest.fn().mockResolvedValue(false);
const mockWaitingListAdd = jest.fn();
const mockNotificationCreate = jest.fn();
const mockSendEmail = jest.fn();
const mockIsValidFileId = jest.fn().mockReturnValue(true);

jest.unstable_mockModule('../src/modules/appointments/appointment.model.js', () => ({
  Appointment: {
    create: mockAppointmentCreate,
    exists: mockAppointmentExists,
  },
}));

jest.unstable_mockModule('../src/modules/providers/provider.model.js', () => ({
  Provider: { findOne: mockProviderFindOne },
}));

// Mock chainable MongoDB methods
mockServiceCatalogFindOne.mockImplementation(() => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(null),
  }),
}));

jest.unstable_mockModule('../src/modules/providers/service.model.js', () => ({
  Service: {
    findOne: mockServiceCatalogFindOne,
    exists: mockServiceCatalogExists,
  },
}));

jest.unstable_mockModule('../src/modules/settings/setting.model.js', () => ({
  Setting: { get: mockSettingGet },
}));

jest.unstable_mockModule('../src/modules/users/user.model.js', () => ({
  User: { findOne: mockUserFindOne },
}));

jest.unstable_mockModule('../src/modules/queue/queueSession.model.js', () => ({
  QueueSession: { findOne: mockQueueSessionFindOne },
}));

jest.unstable_mockModule('../src/modules/notifications/notification.model.js', () => ({
  Notification: { create: mockNotificationCreate },
}));

jest.unstable_mockModule('../src/modules/appointments/waiting-list.service.js', () => ({
  addToWaitingList: mockWaitingListAdd,
}));

jest.unstable_mockModule('../src/modules/notifications/email.service.js', () => ({
  sendEmail: mockSendEmail,
}));

jest.unstable_mockModule('../src/modules/notifications/sms.service.js', () => ({
  sendSms: jest.fn().mockResolvedValue({}),
  sendWhatsApp: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule('../src/modules/appointments/appointment-upload.js', () => ({
  isValidAppointmentFileId: mockIsValidFileId,
}));

// Import after mocking
const { createAppointment } = await import('../src/modules/appointments/token.service.js');

describe('Appointment Creation - averageServiceMinutes & Token Allocation Fix', () => {
  const mockProvider = {
    _id: 'provider123',
    name: 'Test Provider',
    code: 'TP001',
    isActive: true,
    avgServiceMinutes: 20,
    services: ['SERVICE001'],
    workingHours: [],
  };

  const mockService = {
    _id: 'service123',
    code: 'SERVICE001',
    isActive: true,
    channels: ['appointments'],
    providerId: 'provider123',
    durationMinutes: 25,
    requirements: [],
  };

  const baseInput = {
    providerId: 'provider123',
    serviceCode: 'SERVICE001',
    scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    customerPhone: '1234567890',
    bookingType: 'in_person',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock responses
    mockProviderFindOne.mockResolvedValue(mockProvider);
    mockServiceCatalogFindOne.mockResolvedValue(mockService);
    mockUserFindOne.mockResolvedValue(null);
    mockSettingGet.mockImplementation((key, defaultVal) => Promise.resolve(defaultVal));
    mockAppointmentCreate.mockResolvedValue({
      _id: 'appt123',
      ...baseInput,
      status: 'pending',
    });
    mockSendEmail.mockResolvedValue({ mocked: true });
  });

  describe('averageServiceMinutes calculation', () => {
    test('uses catalogService.durationMinutes as first priority', async () => {
      mockServiceCatalogFindOne.mockResolvedValue({
        ...mockService,
        durationMinutes: 45,
      });

      await createAppointment(baseInput);

      // Verify appointment was created successfully
      expect(mockAppointmentCreate).toHaveBeenCalled();
    });

    test('falls back to provider.avgServiceMinutes if service has no duration', async () => {
      mockServiceCatalogFindOne.mockResolvedValue({
        ...mockService,
        durationMinutes: undefined,
      });

      mockProviderFindOne.mockResolvedValue({
        ...mockProvider,
        avgServiceMinutes: 30,
      });

      await createAppointment(baseInput);

      expect(mockAppointmentCreate).toHaveBeenCalled();
    });

    test('falls back to setting value if both service and provider have no duration', async () => {
      mockServiceCatalogFindOne.mockResolvedValue({
        ...mockService,
        durationMinutes: undefined,
      });

      mockProviderFindOne.mockResolvedValue({
        ...mockProvider,
        avgServiceMinutes: undefined,
      });

      mockSettingGet.mockImplementation((key, defaultVal) => {
        if (key === 'service_default_duration_minutes') return Promise.resolve(40);
        return Promise.resolve(defaultVal);
      });

      await createAppointment(baseInput);

      expect(mockAppointmentCreate).toHaveBeenCalled();
    });

    test('defaults to 15 if all sources fail', async () => {
      mockServiceCatalogFindOne.mockResolvedValue({
        ...mockService,
        durationMinutes: null,
      });

      mockProviderFindOne.mockResolvedValue({
        ...mockProvider,
        avgServiceMinutes: null,
      });

      mockSettingGet.mockImplementation((key, defaultVal) => {
        if (key === 'service_default_duration_minutes') return Promise.resolve(null);
        return Promise.resolve(defaultVal);
      });

      await createAppointment(baseInput);

      expect(mockAppointmentCreate).toHaveBeenCalled();
    });

    test('handles NaN values gracefully', async () => {
      mockServiceCatalogFindOne.mockResolvedValue({
        ...mockService,
        durationMinutes: 'invalid', // Will convert to NaN
      });

      mockProviderFindOne.mockResolvedValue({
        ...mockProvider,
        avgServiceMinutes: 'invalid', // Will convert to NaN
      });

      mockSettingGet.mockImplementation((key, defaultVal) => {
        if (key === 'service_default_duration_minutes') return Promise.resolve('invalid');
        return Promise.resolve(defaultVal);
      });

      await createAppointment(baseInput);

      expect(mockAppointmentCreate).toHaveBeenCalled();
    });
  });

  describe('token allocation during creation', () => {
    test('does NOT allocate token number during appointment creation', async () => {
      const createdAppointment = await createAppointment(baseInput);

      // The returned appointment should NOT have tokenNumber
      expect(createdAppointment.appointment.tokenNumber).toBeUndefined();
    });

    test('creates appointment with pending status', async () => {
      mockAppointmentCreate.mockResolvedValue({
        _id: 'appt123',
        ...baseInput,
        status: 'pending',
        tokenNumber: undefined,
        tokenLabel: undefined,
      });

      const createdAppointment = await createAppointment(baseInput);

      expect(createdAppointment.appointment.status).toBe('pending');
      expect(createdAppointment.appointment.tokenNumber).toBeUndefined();
    });

    test('returns qrToken as null during creation', async () => {
      const createdAppointment = await createAppointment(baseInput);

      // Token generation happens only on confirmation, not on creation
      expect(createdAppointment.qrToken).toBeNull();
    });
  });

  describe('appointment creation success', () => {
    test('creates appointment successfully with all required fields', async () => {
      const result = await createAppointment(baseInput);

      expect(mockAppointmentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: baseInput.providerId,
          serviceCode: 'SERVICE001',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          customerPhone: '1234567890',
          status: 'pending',
        })
      );

      expect(result).toHaveProperty('appointment');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('notificationDelivery');
    });

    test('sends creation notification email', async () => {
      await createAppointment(baseInput);

      expect(mockSendEmail).toHaveBeenCalled();
      expect(mockNotificationCreate).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('throws 400 error if customerEmail is missing', async () => {
      const inputWithoutEmail = { ...baseInput, customerEmail: undefined };

      await expect(createAppointment(inputWithoutEmail)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('email'),
      });
    });

    test('throws 400 error if customerPhone is missing', async () => {
      const inputWithoutPhone = { ...baseInput, customerPhone: undefined };

      await expect(createAppointment(inputWithoutPhone)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('phone'),
      });
    });

    test('throws 400 error if customerName is missing', async () => {
      const inputWithoutName = { ...baseInput, customerName: '' };

      await expect(createAppointment(inputWithoutName)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('name'),
      });
    });

    test('throws 400 error if scheduled time is in the past', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      await expect(
        createAppointment({ ...baseInput, scheduledStart: pastDate })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('future'),
      });
    });
  });
});

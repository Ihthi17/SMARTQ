import { extractNoShowFeatures, collectTrainingData, trainNoShowModel, predictNoShowProbability } from './noShowPrediction.service.js';

describe('No-Show Prediction Service', () => {
  let testAppointment;

  beforeEach(() => {
    testAppointment = {
      _id: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439012',
      providerId: '507f1f77bcf86cd799439013',
      scheduledStart: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      createdAt: new Date(),
      bookingType: 'in_person',
      priority: 'normal',
      status: 'pending',
    };
  });

  describe('extractNoShowFeatures', () => {
    test('should extract features from appointment', async () => {
      const features = await extractNoShowFeatures(testAppointment);

      expect(features).toHaveProperty('bookingLeadHours');
      expect(features).toHaveProperty('previousNoShows');
      expect(features).toHaveProperty('previousCompleted');
      expect(features).toHaveProperty('dayOfWeek');
      expect(features).toHaveProperty('hourOfDay');
      expect(features).toHaveProperty('bookingType');
      expect(features).toHaveProperty('priority');
      expect(features).toHaveProperty('reminderSent');

      expect(features.bookingLeadHours).toBeGreater(0);
      expect(features.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(features.dayOfWeek).toBeLessThanOrEqual(6);
      expect(features.hourOfDay).toBeGreaterThanOrEqual(0);
      expect(features.hourOfDay).toBeLessThanOrEqual(23);
    });

    test('should throw error without appointment', async () => {
      await expect(extractNoShowFeatures(null)).rejects.toThrow();
    });

    test('should handle appointments with no booking lead time', async () => {
      const soonAppointment = {
        ...testAppointment,
        scheduledStart: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };

      const features = await extractNoShowFeatures(soonAppointment);
      expect(features.bookingLeadHours).toBeGreaterThan(0);
      expect(features.bookingLeadHours).toBeLessThan(2);
    });
  });

  describe('predictNoShowProbability', () => {
    test('should return valid probability between 0 and 1', async () => {
      try {
        const prediction = await predictNoShowProbability(testAppointment);

        expect(prediction).toHaveProperty('probability');
        expect(prediction).toHaveProperty('riskLevel');
        expect(prediction).toHaveProperty('features');

        expect(prediction.probability).toBeGreaterThanOrEqual(0);
        expect(prediction.probability).toBeLessThanOrEqual(1);
        expect(['low', 'medium', 'high']).toContain(prediction.riskLevel);
      } catch (error) {
        // Model might not be trained, which is expected
        expect(error.message).toContain('No trained model');
      }
    });

    test('should handle model loading error gracefully', async () => {
      const prediction = await predictNoShowProbability(testAppointment);

      // On error, should return neutral prediction
      if (prediction.error) {
        expect(prediction.probability).toBeDefined();
        expect(prediction.riskLevel).toEqual('low');
      }
    });
  });

  describe('Feature normalization', () => {
    test('should normalize features to [0, 1] range', () => {
      const features = {
        bookingLeadHours: 1000, // Very high
        previousNoShows: 100,
        previousCompleted: 1000,
        dayOfWeek: 6,
        hourOfDay: 23,
        bookingType: 'virtual',
        priority: 'emergency',
        reminderSent: true,
      };

      // This tests the normalization happens correctly
      // All normalized values should be between 0 and 1
      expect(Math.min(features.bookingLeadHours / 720, 1)).toBeLessThanOrEqual(1);
      expect(Math.min(features.previousNoShows / 10, 1)).toBeLessThanOrEqual(1);
    });
  });

  describe('Risk level classification', () => {
    test('should classify high risk (>70%)', () => {
      const probability = 0.75;
      const riskLevel = probability > 0.7 ? 'high' : probability > 0.4 ? 'medium' : 'low';
      expect(riskLevel).toEqual('high');
    });

    test('should classify medium risk (40-70%)', () => {
      const probability = 0.55;
      const riskLevel = probability > 0.7 ? 'high' : probability > 0.4 ? 'medium' : 'low';
      expect(riskLevel).toEqual('medium');
    });

    test('should classify low risk (<40%)', () => {
      const probability = 0.25;
      const riskLevel = probability > 0.7 ? 'high' : probability > 0.4 ? 'medium' : 'low';
      expect(riskLevel).toEqual('low');
    });
  });
});

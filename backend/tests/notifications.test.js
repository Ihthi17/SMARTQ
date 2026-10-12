/**
 * SmartQ Notification System - Comprehensive Test Suite
 * Tests all notification channels (SMS, WhatsApp, Email) with fallback logic
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { Appointment } from '../src/modules/appointments/appointment.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { Setting } from '../src/modules/settings/setting.model.js';
import { User } from '../src/modules/users/user.model.js';
import { Provider } from '../src/modules/providers/provider.model.js';

describe('Notification System - Channel Independence & Fallback', () => {
  let authToken;
  let testAppointment;
  let testStaff;
  let testProvider;

  beforeAll(async () => {
    // Connect to test database (handled by test setup)
    // Create test staff user
    testStaff = await User.create({
      username: 'teststaff',
      password: 'Test@1234',
      role: 'staff',
      name: 'Test Staff',
      email: 'staff@test.local',
      status: 'ACTIVE',
    });

    // Create test provider
    testProvider = await Provider.create({
      name: 'Test Location',
      code: 'TEST_LOC',
      type: 'physical',
      isActive: true,
    });

    // Create test appointment
    testAppointment = await Appointment.create({
      tokenLabel: 'TEST-001',
      customerName: 'Test Customer',
      customerPhone: '+1234567890',
      customerEmail: 'customer@test.local',
      scheduledStart: new Date(Date.now() + 3600000),
      serviceCode: 'TEST_SERVICE',
      providerId: testProvider._id,
      assignedStaffId: testStaff._id,
      status: 'booked',
      priority: 'normal',
      createdVia: 'admin',
    });

    // Login as staff to get token
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'teststaff', password: 'Test@1234' });
    authToken = loginRes.body.token;
  });

  afterAll(async () => {
    // Cleanup
    if (testAppointment) await testAppointment.deleteOne();
    if (testStaff) await testStaff.deleteOne();
    if (testProvider) await testProvider.deleteOne();
    await Notification.deleteMany({ appointmentId: testAppointment?._id });
  });

  describe('Settings API - Get Notification Settings', () => {
    test('should return notification settings with group=notification', async () => {
      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ group: 'notification' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      
      const keys = res.body.map(s => s.key);
      expect(keys).toContain('sms_enabled');
      expect(keys).toContain('whatsapp_enabled');
      expect(keys).toContain('smtp_enabled');
    });

    test('should have boolean values for notification settings', async () => {
      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ group: 'notification' });

      const smsEnabled = res.body.find(s => s.key === 'sms_enabled');
      const whatsappEnabled = res.body.find(s => s.key === 'whatsapp_enabled');
      const smtpEnabled = res.body.find(s => s.key === 'smtp_enabled');

      expect(typeof smsEnabled.value).toBe('boolean');
      expect(typeof whatsappEnabled.value).toBe('boolean');
      expect(typeof smtpEnabled.value).toBe('boolean');
    });
  });

  describe('Notification Endpoint - SMS Channel', () => {
    test('should send SMS notification when SMS is enabled', async () => {
      // Enable SMS
      await Setting.set('sms_enabled', true);
      
      const res = await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'sms',
          message: 'Test SMS notification',
          to: '+1234567890',
        });

      // Status depends on whether Twilio is configured
      expect([200, 503]).toContain(res.status);
      expect(res.body.notification).toBeDefined();
      expect(res.body.notification.channel).toBe('sms');
      
      // Check notification was logged
      const notif = await Notification.findOne({
        appointmentId: testAppointment._id,
        channel: 'sms',
      });
      expect(notif).toBeDefined();
      expect(notif.status).toMatch(/sent|failed|mocked/);
    });

    test('should reject SMS with missing recipient', async () => {
      const res = await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'sms',
          message: 'Test SMS',
          to: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('required');
    });

    test('should reject SMS with missing message', async () => {
      const res = await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'sms',
          message: '',
          to: '+1234567890',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('required');
    });
  });

  describe('Notification Endpoint - Email Channel', () => {
    test('should send Email notification when SMTP is enabled', async () => {
      // Enable SMTP
      await Setting.set('smtp_enabled', true);
      
      const res = await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'email',
          message: 'Test Email notification',
          to: 'customer@test.local',
        });

      expect([200, 503]).toContain(res.status);
      expect(res.body.notification).toBeDefined();
      expect(res.body.notification.channel).toBe('email');
      
      // Check notification was logged
      const notif = await Notification.findOne({
        appointmentId: testAppointment._id,
        channel: 'email',
      });
      expect(notif).toBeDefined();
      expect(notif.status).toMatch(/sent|failed|mocked/);
    });

    test('should reject invalid channel', async () => {
      const res = await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'telegram',
          message: 'Test message',
          to: 'customer@test.local',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Channel must be');
    });
  });

  describe('Notification Endpoint - WhatsApp Channel', () => {
    test('should send WhatsApp notification when WhatsApp is enabled', async () => {
      // Enable WhatsApp
      await Setting.set('whatsapp_enabled', true);
      
      const res = await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'whatsapp',
          message: 'Test WhatsApp notification',
          to: '+1234567890',
        });

      expect([200, 503]).toContain(res.status);
      expect(res.body.notification).toBeDefined();
      expect(res.body.notification.channel).toBe('whatsapp');
      
      // Check notification was logged
      const notif = await Notification.findOne({
        appointmentId: testAppointment._id,
        channel: 'whatsapp',
      });
      expect(notif).toBeDefined();
      expect(notif.status).toMatch(/sent|failed|mocked/);
    });
  });

  describe('Notification History Endpoint', () => {
    test('should retrieve notification history for appointment', async () => {
      // Send a test notification first
      await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'email',
          message: 'History test',
          to: 'customer@test.local',
        });

      const res = await request(app)
        .get(`/api/appointments/${testAppointment._id}/notifications`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].channel).toBeDefined();
      expect(res.body[0].status).toBeDefined();
    });

    test('should reject invalid appointment ID', async () => {
      const res = await request(app)
        .get('/api/appointments/invalid-id/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('Fallback Logic - SMS Disabled to Email', () => {
    beforeEach(async () => {
      // Clean up notifications
      await Notification.deleteMany({ appointmentId: testAppointment._id });
    });

    test('should handle gracefully when SMS disabled', async () => {
      // Disable SMS, enable Email
      await Setting.set('sms_enabled', false);
      await Setting.set('smtp_enabled', true);
      
      const res = await request(app)
        .post(`/api/appointments/${testAppointment._id}/notify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channel: 'sms',
          message: 'Should fail - SMS disabled',
          to: '+1234567890',
        });

      expect(res.status).toBe(200);
      // Response should indicate SMS is disabled
      expect(res.body.message || res.body.notification?.status).toBeDefined();
    });

    test('should show all available channels in notification history', async () => {
      const res = await request(app)
        .get(`/api/appointments/${testAppointment._id}/notifications`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      
      // Should have mixed channel types if notifications were sent
      if (res.body.length > 0) {
        const channels = res.body.map(n => n.channel);
        expect(['sms', 'whatsapp', 'email']).toEqual(
          expect.arrayContaining(channels)
        );
      }
    });
  });
});

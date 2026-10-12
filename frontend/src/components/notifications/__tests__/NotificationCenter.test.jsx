/**
 * NotificationCenter Component - Comprehensive Test Suite
 * Tests UI rendering, settings loading, channel availability, and fallback logic
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationCenter from '../NotificationCenter';
import api from '../../../api/axiosInstance';
import toast from 'react-hot-toast';

// Mock the API
vi.mock('../../../api/axiosInstance');
vi.mock('react-hot-toast');

describe('NotificationCenter Component', () => {
  const mockAppointmentId = 'test-appointment-123';
  const mockCustomerPhone = '+1234567890';
  const mockCustomerEmail = 'customer@test.local';

  const mockSettings = {
    sms_enabled: true,
    whatsapp_enabled: true,
    smtp_enabled: true,
  };

  const mockNotificationHistory = [
    {
      _id: '1',
      channel: 'sms',
      status: 'sent',
      message: 'Test SMS',
      sentAt: new Date().toISOString(),
    },
    {
      _id: '2',
      channel: 'email',
      status: 'sent',
      message: 'Test Email',
      sentAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings endpoint
    api.get.mockResolvedValue({
      data: [
        { key: 'sms_enabled', value: mockSettings.sms_enabled, label: 'Enable SMS' },
        { key: 'whatsapp_enabled', value: mockSettings.whatsapp_enabled, label: 'Enable WhatsApp' },
        { key: 'smtp_enabled', value: mockSettings.smtp_enabled, label: 'Enable Email' },
      ],
    });

    // Mock notification history endpoint
    api.get.mockImplementation((url) => {
      if (url.includes('/notifications')) {
        return Promise.resolve({ data: mockNotificationHistory });
      }
      return Promise.resolve({ data: [] });
    });

    // Mock post endpoints
    api.post.mockResolvedValue({
      data: { message: 'Notification sent' },
    });
  });

  describe('Rendering & Initial State', () => {
    test('should render quick notification buttons', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/SMS Confirm/i)).toBeInTheDocument();
        expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
        expect(screen.getByText(/Email Confirm/i)).toBeInTheDocument();
      });
    });

    test('should render History button', () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      expect(screen.getByText(/History/i)).toBeInTheDocument();
    });

    test('should not show SMS button when SMS disabled', async () => {
      api.get.mockResolvedValue({
        data: [
          { key: 'sms_enabled', value: false },
          { key: 'whatsapp_enabled', value: true },
          { key: 'smtp_enabled', value: true },
        ],
      });

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText(/SMS Confirm/i)).not.toBeInTheDocument();
        expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
      });
    });

    test('should not show WhatsApp button when WhatsApp disabled', async () => {
      api.get.mockResolvedValue({
        data: [
          { key: 'sms_enabled', value: true },
          { key: 'whatsapp_enabled', value: false },
          { key: 'smtp_enabled', value: true },
        ],
      });

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/SMS Confirm/i)).toBeInTheDocument();
        expect(screen.queryByText(/WhatsApp/i)).not.toBeInTheDocument();
      });
    });

    test('should not show Email button when Email disabled', async () => {
      api.get.mockResolvedValue({
        data: [
          { key: 'sms_enabled', value: true },
          { key: 'whatsapp_enabled', value: true },
          { key: 'smtp_enabled', value: false },
        ],
      });

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText(/Email Confirm/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Fallback Logic - Only Email Available', () => {
    test('should show "Only Email available" message when SMS/WhatsApp disabled', async () => {
      api.get.mockResolvedValue({
        data: [
          { key: 'sms_enabled', value: false },
          { key: 'whatsapp_enabled', value: false },
          { key: 'smtp_enabled', value: true },
        ],
      });

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Only Email available/i)).toBeInTheDocument();
      });
    });

    test('should show notice in custom message panel when only email available', async () => {
      api.get.mockResolvedValue({
        data: [
          { key: 'sms_enabled', value: false },
          { key: 'whatsapp_enabled', value: false },
          { key: 'smtp_enabled', value: true },
        ],
      });

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      // Open history panel
      const historyBtn = await screen.findByText(/History/i);
      fireEvent.click(historyBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/SMS and WhatsApp are disabled/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Quick Buttons - Sending Notifications', () => {
    test('should send SMS confirmation message', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const smsBtn = await screen.findByText(/SMS Confirm/i);
      fireEvent.click(smsBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/appointments/${mockAppointmentId}/notify`,
          expect.objectContaining({
            channel: 'sms',
            message: expect.stringContaining('confirmed'),
            to: mockCustomerPhone,
          })
        );
      });
    });

    test('should send WhatsApp confirmation message', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const whatsappBtn = await screen.findByText(/WhatsApp/i);
      fireEvent.click(whatsappBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/appointments/${mockAppointmentId}/notify`,
          expect.objectContaining({
            channel: 'whatsapp',
            message: expect.stringContaining('confirmed'),
            to: mockCustomerPhone,
          })
        );
      });
    });

    test('should send Email confirmation message', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const emailBtn = await screen.findByText(/Email Confirm/i);
      fireEvent.click(emailBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/appointments/${mockAppointmentId}/notify`,
          expect.objectContaining({
            channel: 'email',
            message: expect.stringContaining('Check your email'),
            to: mockCustomerEmail,
          })
        );
      });
    });

    test('should show success toast after sending', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const smsBtn = await screen.findByText(/SMS Confirm/i);
      fireEvent.click(smsBtn);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining('sent')
        );
      });
    });
  });

  describe('Custom Message Sending', () => {
    test('should enable custom message sending when message entered', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      // Open history panel
      const historyBtn = await screen.findByText(/History/i);
      fireEvent.click(historyBtn);

      // Find and fill textarea
      const textarea = await screen.findByPlaceholderText(/custom notification/i);
      await userEvent.type(textarea, 'Custom test message');

      // Send buttons should be enabled
      const sendBtns = screen.getAllByText(/Send (SMS|Email|WhatsApp)/i);
      sendBtns.forEach(btn => {
        expect(btn).not.toBeDisabled();
      });
    });

    test('should send custom SMS message', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      // Open panel and enter custom message
      const historyBtn = await screen.findByText(/History/i);
      fireEvent.click(historyBtn);

      const textarea = await screen.findByPlaceholderText(/custom notification/i);
      await userEvent.type(textarea, 'Custom SMS text');

      // Click Send SMS
      const sendSmsBtns = screen.getAllByText(/Send SMS/i);
      fireEvent.click(sendSmsBtns[0]);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/appointments/${mockAppointmentId}/notify`,
          expect.objectContaining({
            channel: 'sms',
            message: 'Custom SMS text',
            to: mockCustomerPhone,
          })
        );
      });
    });

    test('should clear message after successful send', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const historyBtn = await screen.findByText(/History/i);
      fireEvent.click(historyBtn);

      const textarea = await screen.findByPlaceholderText(/custom notification/i);
      await userEvent.type(textarea, 'Test message');

      const sendBtns = screen.getAllByText(/Send SMS/i);
      fireEvent.click(sendBtns[0]);

      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });
  });

  describe('Notification History', () => {
    test('should display notification history', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const historyBtn = await screen.findByText(/History/i);
      fireEvent.click(historyBtn);

      await waitFor(() => {
        expect(screen.getByText('Recent Notifications')).toBeInTheDocument();
        expect(screen.getByText('Test SMS')).toBeInTheDocument();
        expect(screen.getByText('Test Email')).toBeInTheDocument();
      });
    });

    test('should show notification status indicators', async () => {
      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const historyBtn = await screen.findByText(/History/i);
      fireEvent.click(historyBtn);

      await waitFor(() => {
        const sentTexts = screen.getAllByText('sent');
        expect(sentTexts.length).toBeGreaterThan(0);
      });
    });

    test('should show "No notifications sent yet" when empty', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/notifications')) {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: [] });
      });

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const historyBtn = await screen.findByText(/History/i);
      fireEvent.click(historyBtn);

      await waitFor(() => {
        expect(screen.getByText(/No notifications sent yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle settings loading failure gracefully', async () => {
      api.get.mockRejectedValueOnce(new Error('API Error'));

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      // Should still show at least Email button (default fallback)
      await waitFor(() => {
        expect(screen.getByText(/Email Confirm/i)).toBeInTheDocument();
      });
    });

    test('should show error toast on notification send failure', async () => {
      api.post.mockRejectedValueOnce({
        response: { data: { message: 'SMS provider error' } },
      });

      render(
        <NotificationCenter
          appointmentId={mockAppointmentId}
          customerPhone={mockCustomerPhone}
          customerEmail={mockCustomerEmail}
        />
      );

      const smsBtn = await screen.findByText(/SMS Confirm/i);
      fireEvent.click(smsBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });
});

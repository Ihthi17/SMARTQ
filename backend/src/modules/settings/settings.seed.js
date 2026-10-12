import { Setting } from './setting.model.js';

export const settingsDefaults = [
  { key: 'app_name', value: 'Smart Queue', label: 'Application Name', group: 'general' },
  { key: 'support_email', value: '', label: 'Support Email', group: 'general' },
  { key: 'support_phone', value: '', label: 'Support Phone Number', group: 'general' },
  { key: 'timezone', value: 'Asia/Kolkata', label: 'Timezone', group: 'general' },
  { key: 'brand_logo', value: '', label: 'Logo', group: 'general' },
  { key: 'brand_favicon', value: '', label: 'Favicon', group: 'general' },

  { key: 'smtp_host', value: process.env.SMTP_HOST || '', label: 'SMTP Host', group: 'email' },
  { key: 'smtp_port', value: Number(process.env.SMTP_PORT) || 587, label: 'SMTP Port', group: 'email' },
  { key: 'smtp_user', value: process.env.SMTP_USER || '', label: 'SMTP Username', group: 'email' },
  { key: 'smtp_pass', value: process.env.SMTP_PASS || '', label: 'SMTP Password', group: 'email', isSecret: true },
  { key: 'smtp_from', value: process.env.SMTP_FROM || '', label: 'From Address', group: 'email' },
  { key: 'smtp_enabled', value: false, label: 'Enable Email Sends', group: 'email' },

  { key: 'sms_enabled', value: false, label: 'Enable SMS Notifications', group: 'notification' },
  { key: 'sms_provider', value: 'twilio', label: 'SMS Provider', group: 'notification' },
  { key: 'sms_account_sid', value: process.env.TWILIO_ACCOUNT_SID || '', label: 'SMS Account SID', group: 'notification' },
  { key: 'sms_auth_token', value: process.env.TWILIO_AUTH_TOKEN || '', label: 'SMS API Token', group: 'notification', isSecret: true },
  { key: 'sms_from', value: process.env.TWILIO_FROM_NUMBER || '', label: 'SMS Sender Number', group: 'notification' },
  { key: 'whatsapp_enabled', value: false, label: 'Enable WhatsApp Notifications', group: 'notification' },
  { key: 'whatsapp_api_url', value: '', label: 'WhatsApp API URL', group: 'notification' },
  { key: 'whatsapp_api_key', value: '', label: 'WhatsApp API Key', group: 'notification', isSecret: true },
  { key: 'whatsapp_sender', value: '', label: 'WhatsApp Sender', group: 'notification' },

  { key: 'google_maps_api_key', value: process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '', label: 'Google Maps API Key', group: 'location', isSecret: true },

  { key: 'appointment_max_per_customer', value: 50, label: 'Maximum Appointments per Customer', group: 'appointment' },
  { key: 'appointment_max_daily', value: 100, label: 'Maximum Daily Appointments', group: 'appointment' },
  { key: 'appointment_duration_minutes', value: 30, label: 'Appointment Duration (minutes)', group: 'appointment' },
  { key: 'appointment_buffer_minutes', value: 5, label: 'Buffer Time (minutes)', group: 'appointment' },
  { key: 'appointment_no_show_grace_minutes', value: 15, label: 'No-show Grace Period (minutes)', group: 'appointment' },
  { key: 'appointment_auto_cancel', value: false, label: 'Auto Cancellation', group: 'appointment' },
  { key: 'appointment_waiting_list', value: true, label: 'Waiting List', group: 'appointment' },
  { key: 'appointment_recurring', value: false, label: 'Recurring Appointments', group: 'appointment' },
  { key: 'appointment_walk_in', value: true, label: 'Walk-in Appointments', group: 'appointment' },
  { key: 'appointment_emergency', value: true, label: 'Emergency Appointments', group: 'appointment' },
  { key: 'appointment_double_booking', value: false, label: 'Double Booking', group: 'appointment' },
  { key: 'appointment_provider_availability', value: true, label: 'Provider Availability', group: 'appointment' },
  { key: 'appointment_holiday_blocking', value: true, label: 'Holiday Blocking', group: 'appointment' },
  { key: 'appointment_holidays', value: '', label: 'Holiday Dates (YYYY-MM-DD, one per line)', group: 'appointment' },
  { key: 'appointment_status_configuration', value: 'pending\nconfirmed\nqueued\ncalled\nin_service\ncompleted\ncancelled\nexpired\nno_show', label: 'Appointment Status Configuration', group: 'appointment' },
  { key: 'appointment_delete_finished', value: false, label: 'Automatically Delete Finished Appointments', group: 'appointment' },
  { key: 'appointment_delete_finished_after_days', value: 1, label: 'Delete Finished Appointments After (days)', group: 'appointment' },

  { key: 'queue_auto_start', value: true, label: 'Automatically Start Queue', group: 'queue' },
  { key: 'queue_max_size', value: 50, label: 'Maximum Queue Size', group: 'queue' },
  { key: 'queue_emergency_priority', value: true, label: 'Allow Emergency Priority', group: 'queue' },
  { key: 'queue_require_location_checkin', value: true, label: 'Require Location QR Check-in', group: 'queue' },
  { key: 'queue_show_customer_names', value: false, label: 'Show Customer Names on Public Display', group: 'queue' },
  { key: 'queue_color_current', value: '#0f766e', label: 'Now Serving Color', group: 'queue' },
  { key: 'queue_color_next', value: '#7c3aed', label: 'Next Queue Color', group: 'queue' },
  { key: 'queue_color_accent', value: '#0d9488', label: 'Queue Statistics Accent Color', group: 'queue' },
  { key: 'queue_prefix', value: 'Q', label: 'Queue Prefix', group: 'queue' },
  { key: 'queue_prefix_vip', value: 'VIP', label: 'VIP Queue Prefix', group: 'queue' },
  { key: 'queue_prefix_emergency', value: 'EMG', label: 'Emergency Queue Prefix', group: 'queue' },
  { key: 'queue_start_number', value: 1, label: 'Queue Start Number', group: 'queue' },
  { key: 'queue_priority_strategy', value: 'FIFO', label: 'Priority Strategy (FIFO/Priority-Based)', group: 'queue' },
  { key: 'queue_number_reset', value: 'daily', label: 'Queue Number Reset Frequency (daily/weekly/monthly/never)', group: 'queue' },
  { key: 'queue_number_reset_time', value: '00:00', label: 'Queue Number Reset Time (HH:MM format)', group: 'queue' },
  { key: 'queue_no_show_handling', value: 'mark_no_show', label: 'No-Show Handling (mark_no_show/auto_cancel/keep_queued)', group: 'queue' },
  { key: 'queue_calling_method', value: 'all_counters', label: 'Queue Calling Method (all_counters/specific_counter)', group: 'queue' },
  { key: 'queue_recall_enabled', value: true, label: 'Enable Queue Recall/Remind', group: 'queue' },
  { key: 'queue_recall_attempts', value: 3, label: 'Maximum Recall Attempts', group: 'queue' },
  { key: 'queue_auto_recall_after_minutes', value: 2, label: 'Auto Recall After (minutes)', group: 'queue' },
  { key: 'counter_assignment_mode', value: 'auto', label: 'Counter Assignment Mode (disabled/manual/auto)', group: 'queue' },

  { key: 'waiting_list_expiration_hours', value: 24, label: 'Waiting List Expiration (hours)', group: 'appointment' },
  { key: 'waiting_list_confirmation_deadline_minutes', value: 30, label: 'Waiting List Confirmation Deadline (minutes)', group: 'appointment' },

  { key: 'recurring_max_occurrences', value: 52, label: 'Maximum Recurring Occurrences', group: 'appointment' },
  { key: 'recurring_enabled_types', value: 'daily\nweekly\nbiweekly\nmonthly', label: 'Enabled Recurring Types', group: 'appointment' },

  { key: 'service_default_duration_minutes', value: 15, label: 'Default Service Duration (minutes)', group: 'service' },
  { key: 'service_allow_online_booking', value: true, label: 'Allow Online Booking', group: 'service' },
  { key: 'service_require_appointment', value: false, label: 'Require Appointment', group: 'service' },

  { key: 'system_maintenance_mode', value: false, label: 'Maintenance Mode', group: 'system' },
  { key: 'system_session_timeout_minutes', value: 60, label: 'Session Timeout (minutes)', group: 'system' },

  { key: 'audit_enabled', value: true, label: 'Enable Audit Logging', group: 'audit' },
  { key: 'audit_appointment_changes', value: true, label: 'Track Appointment Changes', group: 'audit' },
  { key: 'audit_retention_days', value: 365, label: 'Audit Log Retention (days)', group: 'audit' },

  { key: 'backup_enabled', value: false, label: 'Enable Automatic Backups', group: 'backup' },
  { key: 'backup_interval_hours', value: 24, label: 'Backup Interval (hours)', group: 'backup' },
  { key: 'backup_retention_count', value: 7, label: 'Backups to Retain', group: 'backup' },
];

export const seedSettings = async () => {
  // Remove any invalid settings that might exist from old versions
  const validKeys = new Set(settingsDefaults.map(s => s.key));
  const invalidSettings = await Setting.find({ key: { $nin: Array.from(validKeys) } });
  if (invalidSettings.length > 0) {
    console.log(`[SEED] Removing ${invalidSettings.length} invalid settings:`, invalidSettings.map(s => s.key).join(', '));
    await Setting.deleteMany({ key: { $nin: Array.from(validKeys) } });
  }

  const autoCancelConfigured = await Setting.findOne({ key: 'appointment_auto_cancel_configured' });
  for (const setting of settingsDefaults) {
    await Setting.updateOne(
      { key: setting.key },
      {
        $setOnInsert: { value: setting.value },
        $set: {
          label: setting.label,
          group: setting.group,
          isSecret: setting.isSecret || false,
        },
      },
      { upsert: true },
    );
  }
  if (!autoCancelConfigured) {
    await Setting.updateOne({ key: 'appointment_auto_cancel' }, { $set: { value: false } });
  }
};

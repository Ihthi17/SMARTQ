import { useEffect, useState } from 'react';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { Send, MessageSquare, Phone, Mail, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export default function NotificationCenter({ appointmentId, customerPhone, customerEmail }) {
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState({ sms: true, whatsapp: false, email: true });
  const [customMessage, setCustomMessage] = useState('');
  const [notificationSettings, setNotificationSettings] = useState({
    sms_enabled: false,
    whatsapp_enabled: false,
    smtp_enabled: false
  });

  useEffect(() => {
    if (showPanel && appointmentId) {
      loadNotificationHistory();
      loadNotificationSettings();
    }
  }, [showPanel, appointmentId]);

  const loadNotificationSettings = async () => {
    try {
      const { data } = await api.get('/settings', { 
        params: { group: 'notification' } 
      });
      const settings = {};
      data.forEach(setting => {
        if (setting.key === 'sms_enabled') settings.sms_enabled = setting.value === true || setting.value === 'true';
        if (setting.key === 'whatsapp_enabled') settings.whatsapp_enabled = setting.value === true || setting.value === 'true';
        if (setting.key === 'smtp_enabled') settings.smtp_enabled = setting.value === true || setting.value === 'true';
      });
      setNotificationSettings(settings);
      
      // Set default channels based on enabled settings
      setSelectedChannels({
        sms: settings.sms_enabled,
        whatsapp: settings.whatsapp_enabled,
        email: settings.smtp_enabled
      });
    } catch (error) {
      console.error('Could not load notification settings', error);
      // Default to email only if settings can't be loaded
      setNotificationSettings({ sms_enabled: false, whatsapp_enabled: false, smtp_enabled: true });
      setSelectedChannels({ sms: false, whatsapp: false, email: true });
    }
  };

  const loadNotificationHistory = async () => {
    try {
      const { data } = await api.get(`/appointments/${appointmentId}/notifications`);
      setNotificationHistory(data || []);
    } catch (error) {
      console.error('Could not load notification history', error);
    }
  };

  const sendNotification = async (channel, messageOverride = null) => {
    // Check if channel is enabled in settings
    const channelSettingMap = {
      'sms': 'sms_enabled',
      'whatsapp': 'whatsapp_enabled',
      'email': 'smtp_enabled'
    };
    
    const isChannelEnabled = notificationSettings[channelSettingMap[channel]];
    
    // Smart fallback logic: if SMS/WhatsApp disabled, try Email instead
    if (!isChannelEnabled && (channel === 'sms' || channel === 'whatsapp')) {
      if (notificationSettings.smtp_enabled && customerEmail) {
        toast.info(`${channel.toUpperCase()} is disabled. Sending via Email instead.`);
        return sendNotification('email', messageOverride);
      } else {
        toast.error(`${channel.toUpperCase()} and Email are not available in settings.`);
        return;
      }
    }
    
    if (!isChannelEnabled) {
      toast.error(`${channel.toUpperCase()} is not enabled in settings.`);
      return;
    }

    setLoading(true);
    try {
      const message = messageOverride || customMessage || `Appointment status update: ${new Date().toLocaleString()}`;
      
      const { data } = await api.post(`/appointments/${appointmentId}/notify`, {
        channel,
        message,
        to: channel === 'sms' || channel === 'whatsapp' ? customerPhone : customerEmail,
      });

      toast.success(`${channel.toUpperCase()} notification sent`);
      setCustomMessage('');
      await loadNotificationHistory();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to send ${channel} notification`);
    } finally {
      setLoading(false);
    }
  };

  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'sms':
        return <Phone size={16} />;
      case 'whatsapp':
        return <MessageSquare size={16} />;
      case 'email':
        return <Mail size={16} />;
      default:
        return <Send size={16} />;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent':
        return <CheckCircle size={14} className="text-emerald-600" />;
      case 'failed':
        return <AlertCircle size={14} className="text-red-600" />;
      case 'pending':
        return <Clock size={14} className="text-amber-600" />;
      default:
        return null;
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      
      {/* Quick Notification Buttons */}
      <div className="flex flex-wrap gap-2">
        {customerPhone && notificationSettings.sms_enabled && (
          <button
            onClick={() => sendNotification('sms', 'Your appointment has been confirmed. Please arrive at the location soon.')}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-700 text-white px-3 py-2 text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            <Phone size={14} />
            SMS Confirm
          </button>
        )}
        {customerPhone && notificationSettings.whatsapp_enabled && (
          <button
            onClick={() => sendNotification('whatsapp', 'Your appointment has been confirmed. Please arrive at the location soon.')}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <MessageSquare size={14} />
            WhatsApp
          </button>
        )}
        {customerEmail && notificationSettings.smtp_enabled && (
          <button
            onClick={() => sendNotification('email', 'Your appointment has been confirmed. Check your email for details.')}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-sky-500 bg-sky-500 text-white px-3 py-2 text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
          >
            <Mail size={14} />
            Email Confirm
          </button>
        )}
        
        {/* Fallback: If SMS/WhatsApp disabled, show Email as primary */}
        {customerEmail && !notificationSettings.sms_enabled && !notificationSettings.whatsapp_enabled && notificationSettings.smtp_enabled && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            <AlertCircle size={14} />
            Only Email available
          </div>
        )}

        {/* History button */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Send size={14} />
          {showPanel ? 'Close' : 'History'}
        </button>
      </div>

      {/* Notification History Panel */}
      {showPanel && (
        <div className="mt-4 rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-3">Notification History & Send Custom</h3>
          
          {/* Custom Message Input */}
          <div className="mb-4 space-y-3">
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Type custom notification message..."
              rows="3"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            
            <div className="flex flex-wrap gap-2">
              {customerPhone && notificationSettings.sms_enabled && (
                <button
                  onClick={() => sendNotification('sms')}
                  disabled={loading || !customMessage.trim()}
                  className="flex items-center gap-2 rounded-lg bg-slate-700 text-white px-3 py-2 text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
                >
                  <Phone size={14} />
                  Send SMS
                </button>
              )}
              {customerPhone && notificationSettings.whatsapp_enabled && (
                <button
                  onClick={() => sendNotification('whatsapp')}
                  disabled={loading || !customMessage.trim()}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <MessageSquare size={14} />
                  Send WhatsApp
                </button>
              )}
              {customerEmail && notificationSettings.smtp_enabled && (
                <button
                  onClick={() => sendNotification('email')}
                  disabled={loading || !customMessage.trim()}
                  className="flex items-center gap-2 rounded-lg bg-sky-500 text-white px-3 py-2 text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
                >
                  <Mail size={14} />
                  Send Email
                </button>
              )}
              
              {/* Show notice if only email is available */}
              {!notificationSettings.sms_enabled && !notificationSettings.whatsapp_enabled && notificationSettings.smtp_enabled && (
                <div className="w-full rounded-lg border border-blue-300 bg-blue-50 p-2 text-xs text-blue-700">
                  <p className="font-medium">ℹ SMS and WhatsApp are disabled. Messages will be sent via Email only.</p>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-sm font-medium text-slate-700 mb-2">Recent Notifications</h4>
            {notificationHistory.length === 0 ? (
              <p className="text-xs text-slate-500">No notifications sent yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notificationHistory.map((notification, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(notification.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getChannelIcon(notification.channel)}
                        <span className="text-xs font-semibold text-slate-700 capitalize">
                          {notification.channel}
                        </span>
                        <span className="text-xs text-slate-500 capitalize">{notification.status}</span>
                      </div>
                      {notification.message && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{notification.message}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(notification.sentAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import twilio from 'twilio';
import { Setting } from '../settings/setting.model.js';

const configurationError = (message) => Object.assign(new Error(message), { statusCode: 503 });

export const sendSms = async ({ to, message }) => {
  if (!to || !message) throw Object.assign(new Error('SMS recipient and message are required.'), { statusCode: 400 });
  const enabled = await Setting.get('sms_enabled', false);
  if (!enabled) throw configurationError('SMS notifications are disabled.');
  const [accountSid, authToken, from] = await Promise.all([
    Setting.get('sms_account_sid'),
    Setting.get('sms_auth_token'),
    Setting.get('sms_from'),
  ]);
  if (!accountSid || !authToken || !from) throw configurationError('Configure the SMS account SID, API token, and sender number.');
  const client = twilio(accountSid, authToken);
  return client.messages.create({ to, from, body: message });
};

export const sendWhatsApp = async ({ to, message }) => {
  if (!to || !message) throw Object.assign(new Error('WhatsApp recipient and message are required.'), { statusCode: 400 });
  const enabled = await Setting.get('whatsapp_enabled', false);
  if (!enabled) throw configurationError('WhatsApp notifications are disabled.');
  const [apiUrl, apiKey, sender] = await Promise.all([
    Setting.get('whatsapp_api_url'),
    Setting.get('whatsapp_api_key'),
    Setting.get('whatsapp_sender'),
  ]);
  if (!apiUrl || !apiKey) throw configurationError('Configure the WhatsApp API URL and API key.');
  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
        ...(sender ? { sender } : {}),
      }),
    });
  } catch (error) {
    throw Object.assign(new Error(`WhatsApp provider request failed: ${error.message}`), { statusCode: 502 });
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw Object.assign(new Error(`WhatsApp provider returned ${response.status}: ${detail}`), { statusCode: 502 });
  }
  const payload = await response.text();
  try {
    return payload ? JSON.parse(payload) : {};
  } catch {
    throw Object.assign(new Error('WhatsApp provider returned an invalid response.'), { statusCode: 502 });
  }
};

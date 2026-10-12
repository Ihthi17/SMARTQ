import { Setting } from './setting.model.js';
import { settingsDefaults } from './settings.seed.js';
import { getTransporter } from '../notifications/email.service.js';
import { AuditLog } from './auditLog.model.js';
import { writeAuditLog } from './audit.service.js';
import { sendSms, sendWhatsApp } from '../notifications/sms.service.js';
import {
  createDatabaseBackup,
  getDatabaseBackupPath,
  listDatabaseBackups,
  restoreDatabaseBackup,
} from './backup.service.js';

const settingsByKey = new Map(settingsDefaults.map((setting) => [setting.key, setting]));
const MAX_BRAND_ASSET_BYTES = 2 * 1024 * 1024;

const isValidBrandAsset = (value) => {
  if (value === '') return true;
  if (typeof value !== 'string') return false;
  const match = value.match(/^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i);
  return Boolean(match) && Math.floor((match[2].length * 3) / 4) <= MAX_BRAND_ASSET_BYTES;
};

const isValidSettingValue = (definition, value) => {
  if (definition.key.startsWith('brand_')) return isValidBrandAsset(value);
  if (definition.key.startsWith('queue_color_')) return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (typeof definition.value === 'boolean') return typeof value === 'boolean';
  if (typeof definition.value === 'number') return Number.isSafeInteger(value) && value >= 0;
  if (definition.key === 'appointment_holidays') {
    if (typeof value !== 'string' || value.length > 2000) return false;
    return value.split(/\r?\n/).map((date) => date.trim()).filter(Boolean).every((date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const parsed = new Date(`${date}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    });
  }
  if (definition.key === 'timezone') {
    if (typeof value !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch { return false; }
  }
  return typeof value === 'string' && value.length <= 2000;
};

export const getBranding = async (req, res, next) => {
  try {
    const [appName, favicon, logo, currentColor, nextColor, accentColor] = await Promise.all([
      Setting.get('app_name', 'Smart Queue'),
      Setting.get('brand_favicon', ''),
      req.query.includeLogo === 'false' ? '' : Setting.get('brand_logo', ''),
      Setting.get('queue_color_current', '#0f766e'),
      Setting.get('queue_color_next', '#7c3aed'),
      Setting.get('queue_color_accent', '#0d9488'),
    ]);
    res.set('Cache-Control', 'no-store');
    return res.json({ appName, logo, favicon, queueColors: { current: currentColor, next: nextColor, accent: accentColor } });
  } catch (err) { next(err); }
};

// GET /api/settings/maps-key — get Google Maps API key (authenticated, admin or user)
export const getMapsKey = async (req, res, next) => {
  try {
    const mapsKey = await Setting.get('google_maps_api_key', '');
    res.set('Cache-Control', 'no-store');
    return res.json({ key: mapsKey || null });
  } catch (err) { next(err); }
};

// GET /api/settings?group=notification  (admin only)
export const getSettings = async (req, res, next) => {
  try {
    const filter = req.query.group ? { group: req.query.group } : { group: { $ne: 'internal' } };
    const docs = await Setting.find(filter).sort('group key');
    const safe = docs.map((d) => ({
      key:     d.key,
      value:   d.isSecret ? '••••' : d.value,
      label:   d.label,
      group:   d.group,
      isSecret: d.isSecret,
      updatedAt: d.updatedAt,
    }));
    return res.json(safe);
  } catch (err) { next(err); }
};

// PATCH /api/settings  body: { updates: [{ key, value }] }  (admin only)
export const updateSettings = async (req, res, next) => {
  try {
    const updates = req.body?.updates;
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ message: 'updates array is required' });

    for (const update of updates) {
      const { key, value } = update || {};
      const definition = settingsByKey.get(key);
      if (!definition)
        return res.status(400).json({ message: `Unknown setting: ${key}` });
      if (!isValidSettingValue(definition, value))
        return res.status(400).json({ message: `Invalid value for setting: ${key}` });
    }

    for (const { key, value } of updates) {
      await Setting.set(key, value, { updatedBy: req.user?.userId });
    }
    if (updates.some(({ key }) => key === 'appointment_auto_cancel')) {
      await Setting.set('appointment_auto_cancel_configured', true, { updatedBy: req.user?.userId, group: 'internal' });
    }
    await writeAuditLog(req, { action: 'settings.updated', resource: 'settings', details: { keys: updates.map(({ key }) => key) } });
    return res.json({ message: 'Settings saved' });
  } catch (err) { next(err); }
};

// POST /api/settings/smtp/test  — send a test email using current DB settings
export const testSmtp = async (req, res, next) => {
  try {
    const to = req.body?.to || req.user?.email;
    if (!to) return res.status(400).json({ message: 'Provide a recipient email address' });

    const transporter = await getTransporter();
    if (!transporter) return res.status(503).json({ message: 'SMTP is not configured' });

    const from = (await Setting.get('smtp_from')) || (await Setting.get('smtp_user'));
    await transporter.sendMail({
      from,
      to,
      subject: 'Smart Queue — SMTP Test',
      text: 'Your SMTP configuration is working correctly.',
    });
    await writeAuditLog(req, { action: 'settings.email_tested', resource: 'settings', details: { recipient: to } });
    return res.json({ message: `Test email sent to ${to}` });
  } catch (err) { next(err); }
};

export const testNotification = async (req, res, next) => {
  try {
    const { channel, to } = req.body || {};
    if (!['sms', 'whatsapp'].includes(channel))
      return res.status(400).json({ message: 'Channel must be sms or whatsapp.' });
    if (typeof to !== 'string' || !to.trim())
      return res.status(400).json({ message: 'Provide a recipient phone number.' });
    const message = 'Smart Queue test notification: your channel configuration is working.';
    const result = channel === 'sms'
      ? await sendSms({ to: to.trim(), message })
      : await sendWhatsApp({ to: to.trim(), message });
    await writeAuditLog(req, { action: 'settings.notification_tested', resource: 'settings', details: { channel } });
    return res.json({ message: `Test ${channel.toUpperCase()} notification sent.`, providerMessageId: result.sid || result.messages?.[0]?.id });
  } catch (err) { next(err); }
};

export const listAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const filter = {};
    if (req.query.resource) filter.resource = String(req.query.resource).slice(0, 100);
    if (req.query.action) filter.action = String(req.query.action).slice(0, 100);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).populate('actorId', 'username name').sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

export const listBackups = async (_req, res, next) => {
  try {
    return res.json(await listDatabaseBackups());
  } catch (err) { next(err); }
};

export const createBackup = async (_req, res, next) => {
  try {
    const backup = await createDatabaseBackup();
    await writeAuditLog(_req, { action: 'backup.created', resource: 'backup', resourceId: backup.name });
    return res.status(201).json(backup);
  } catch (err) { next(err); }
};

export const downloadBackup = async (req, res, next) => {
  try {
    const backups = await listDatabaseBackups();
    if (!backups.some((backup) => backup.name === req.params.name))
      return res.status(404).json({ message: 'Backup not found' });
    return res.download(getDatabaseBackupPath(req.params.name), req.params.name, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (err) { next(err); }
};

export const restoreBackup = async (req, res, next) => {
  try {
    if (req.body?.confirmation !== 'RESTORE')
      return res.status(400).json({ message: 'Type RESTORE to confirm database replacement.' });
    const safetyBackup = await createDatabaseBackup();
    const result = await restoreDatabaseBackup(req.body?.backup);
    await writeAuditLog(req, { action: 'backup.restored', resource: 'backup', resourceId: safetyBackup.name, details: result });
    return res.json({ message: 'Database restored successfully.', safetyBackup: safetyBackup.name, ...result });
  } catch (err) { next(err); }
};

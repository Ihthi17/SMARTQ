import { useContext, useState, useEffect } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import {
  Settings, Save, Send, Eye, EyeOff, Bell, CalendarDays, ListOrdered,
  BriefcaseBusiness, Mail, SlidersHorizontal, ScrollText, Database, Building2,
  Download, RotateCcw, MapPin,
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import ColorPicker from '../../components/ColorPicker';

const GROUPS = [
  { id: 'general', label: 'General', description: 'Organization details and branding', icon: Building2 },
  { id: 'location', label: 'Location', description: 'Google Maps API configuration', icon: MapPin },
  { id: 'notification', label: 'Notifications', description: 'SMS and WhatsApp providers', icon: Bell },
  { id: 'appointment', label: 'Appointments', description: 'Booking rules and limits', icon: CalendarDays },
  { id: 'queue', label: 'Queue', description: 'Queue management and prefixes', icon: ListOrdered },
  { id: 'service', label: 'Services', description: 'Service defaults and booking', icon: BriefcaseBusiness },
  { id: 'email', label: 'Email', description: 'SMTP connection and tests', icon: Mail },
  { id: 'system', label: 'System', description: 'Platform-wide behavior', icon: SlidersHorizontal },
  { id: 'audit', label: 'Audit logs', description: 'Activity history and retention', icon: ScrollText },
  { id: 'backup', label: 'Backup & recovery', description: 'Automatic backups and restore', icon: Database },
];

const Field = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-slate-600">{label}</label>
    {children}
  </div>
);

const TextInput = ({ value, onChange, type = 'text', placeholder, min, step, required = false }) => (
  <input
    type={type} value={value} onChange={onChange} placeholder={placeholder}
    min={min} step={step} required={required}
    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
  />
);

const ToggleInput = ({ value, onChange }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer">
    <div className="relative">
      <input type="checkbox" checked={!!value} onChange={onChange} className="sr-only peer" />
      <div className="w-10 h-5 bg-slate-200 rounded-full peer-checked:bg-teal-600 transition-colors" />
      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
    </div>
    <span className="text-sm text-slate-600">{value ? 'Enabled' : 'Disabled'}</span>
  </label>
);

const SelectInput = ({ value, onChange, options }) => (
  <select
    value={String(value)}
    onChange={onChange}
    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
  >
    <option value="">-- Select an option --</option>
    {options.map(([val, label]) => (
      <option key={val} value={val}>{label}</option>
    ))}
  </select>
);

export default function SettingsPage() {
  const { user, permissions } = useContext(AuthContext);
  const canManage = user?.role === 'SUPER_ADMIN' || permissions.includes('settings.manage');
  const [settings, setSettings] = useState([]);
  const [values, setValues]     = useState({});
  const [reveal, setReveal]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [testTo, setTestTo]     = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [tab, setTab]           = useState('');
  const [backups, setBackups]   = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagesTotal, setAuditPagesTotal] = useState(1);
  const [auditLimit, setAuditLimit] = useState(10);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');

  useEffect(() => {
    api.get('/settings').then(r => {
      setSettings(r.data);
      const v = {};
      r.data.forEach(s => { v[s.key] = s.isSecret ? '' : s.value; });
      setValues(v);
    }).catch(() => toast.error('Failed to load settings'));
  }, []);

  const loadBackups = async () => {
    try {
      const response = await api.get('/settings/backup');
      setBackups(response.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load backups');
    }
  };

  const testNotification = async (channel) => {
    if (!testPhone.trim()) return toast.error('Enter a recipient phone number');
    setTestingNotification(true);
    try {
      const { data } = await api.post('/settings/notifications/test', { channel, to: testPhone.trim() });
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || `${channel} test failed`);
    } finally { setTestingNotification(false); }
  };

  useEffect(() => {
    if (tab === 'backup' && canManage) loadBackups();
    if (tab === 'audit') {
      api.get('/settings/audit', { params: { page: auditPage, limit: auditLimit } })
        .then(({ data }) => {
          setAuditLogs(data.logs || []);
          setAuditPagesTotal(data.pages || 1);
        })
        .catch(error => toast.error(error.response?.data?.message || 'Failed to load audit logs'));
    }
  }, [tab, canManage, auditPage, auditLimit]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates = Object.entries(values)
        .filter(([key, val]) => {
          const s = settings.find(x => x.key === key);
          if (s?.group !== tab) return false;
          // skip secret placeholders that weren't changed
          return !(s?.isSecret && val === '');
        })
        .map(([key, value]) => {
          // coerce port to number
          if (typeof settings.find(x => x.key === key)?.value === 'number') {
            return { key, value: Number(value) };
          }
          return { key, value };
        });
      
      if (updates.length === 0) {
        toast.info('No changes to save');
        setSaving(false);
        return;
      }

      const response = await api.patch('/settings', { updates });
      
      // Reload ALL settings to ensure state is synchronized
      const settingsResponse = await api.get('/settings');
      setSettings(settingsResponse.data);
      const v = {};
      settingsResponse.data.forEach(s => { v[s.key] = s.isSecret ? '' : s.value; });
      setValues(v);
      
      // Dispatch events to notify all system components of settings changes
      window.dispatchEvent(new Event('smartqueue:settings-updated'));
      
      // Group-specific events
      if (tab === 'general') {
        window.dispatchEvent(new Event('smartqueue:branding-updated'));
        window.dispatchEvent(new Event('smartqueue:general-settings-updated'));
      } else if (tab === 'appointment') {
        window.dispatchEvent(new Event('smartqueue:appointment-settings-updated'));
      } else if (tab === 'queue') {
        window.dispatchEvent(new Event('smartqueue:queue-settings-updated'));
      } else if (tab === 'location') {
        window.dispatchEvent(new Event('smartqueue:location-settings-updated'));
      } else if (tab === 'notification') {
        window.dispatchEvent(new Event('smartqueue:notification-settings-updated'));
      } else if (tab === 'email') {
        window.dispatchEvent(new Event('smartqueue:email-settings-updated'));
      } else if (tab === 'system') {
        window.dispatchEvent(new Event('smartqueue:system-settings-updated'));
      }
      
      toast.success(`${tab.charAt(0).toUpperCase() + tab.slice(1)} settings saved and applied to the system`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    if (!testTo) return toast.error('Enter a recipient email');
    setTesting(true);
    try {
      const r = await api.post('/settings/smtp/test', { to: testTo });
      toast.success(r.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    } finally { setTesting(false); }
  };

  const createBackup = async () => {
    setBackupBusy(true);
    try {
      const response = await api.post('/settings/backup');
      toast.success(`Backup created: ${response.data.name}`);
      await loadBackups();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Backup creation failed');
    } finally { setBackupBusy(false); }
  };

  const downloadBackup = async (name) => {
    try {
      const response = await api.get(`/settings/backup/${encodeURIComponent(name)}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Backup download failed');
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) return toast.error('Choose a Smart Queue backup file');
    if (restoreConfirmation !== 'RESTORE') return toast.error('Type RESTORE to confirm');
    setBackupBusy(true);
    try {
      const backup = JSON.parse(await restoreFile.text());
      const response = await api.post('/settings/backup/restore', {
        backup,
        confirmation: restoreConfirmation,
      });
      toast.success(`${response.data.message} Safety copy: ${response.data.safetyBackup}`);
      setRestoreFile(null);
      setRestoreConfirmation('');
      await loadBackups();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Database restore failed');
    } finally { setBackupBusy(false); }
  };

  const grouped = GROUPS.map(g => ({
    ...g,
    items: settings.filter(s => s.group === g.id && !s.key.startsWith('priority_color_')),
  }));

  const setValue = (key, val) => setValues(v => ({ ...v, [key]: val }));

  const setBrandAsset = (key, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo and favicon files must be 2 MB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setValue(key, reader.result);
    reader.onerror = () => toast.error('Could not read the selected image');
    reader.readAsDataURL(file);
  };

  const renderField = (s) => {
    const val = values[s.key] ?? '';
    
    // Queue dropdown selects and Appointment dropdowns
    const dropdownFields = {
      'queue_no_show_handling': [
        ['mark_no_show', 'Mark as No-Show'],
        ['auto_cancel', 'Auto Cancel'],
        ['keep_queued', 'Keep Queued'],
      ],
      'queue_number_reset': [
        ['daily', 'Daily'],
        ['weekly', 'Weekly'],
        ['monthly', 'Monthly'],
        ['never', 'Never'],
      ],
      'queue_priority_strategy': [
        ['FIFO', 'FIFO (First In, First Out)'],
        ['Priority-Based', 'Priority-Based'],
      ],
      'queue_calling_method': [
        ['all_counters', 'All Counters'],
        ['specific_counter', 'Specific Counter'],
      ],
      'counter_assignment_mode': [
        ['disabled', 'Disabled'],
        ['manual', 'Manual'],
        ['auto', 'Auto'],
      ],
      'recurring_enabled_types': [
        ['daily', 'Daily'],
        ['weekly', 'Weekly'],
        ['biweekly', 'Bi-Weekly'],
        ['monthly', 'Monthly'],
        ['daily,weekly', 'Daily & Weekly'],
        ['daily,weekly,biweekly', 'Daily, Weekly & Bi-Weekly'],
        ['daily,weekly,biweekly,monthly', 'All Types (Daily, Weekly, Bi-Weekly, Monthly)'],
      ],
    };
    
    // Special handling for queue start number
    if (s.key === 'queue_start_number') {
      return (
        <TextInput
          type="number"
          value={String(val)}
          onChange={e => setValue(s.key, Math.max(1, parseInt(e.target.value) || 1))}
          min={1}
          step={1}
          placeholder="Starting number for queue tokens"
        />
      );
    }
    
    if (dropdownFields[s.key]) {
      return (
        <SelectInput
          value={val}
          onChange={e => setValue(s.key, e.target.value)}
          options={dropdownFields[s.key]}
        />
      );
    }
    
    if (s.key.startsWith('queue_color_')) {
      return (
        <ColorPicker 
          value={/^#[0-9a-f]{6}$/i.test(String(val)) ? val : '#0f766e'}
          onChange={e => setValue(s.key, e)}
          label={s.label}
        />
      );
    }
    if (s.key === 'appointment_status_configuration' || s.key === 'appointment_holidays') {
      return (
        <textarea value={String(val)} onChange={e => setValue(s.key, e.target.value)} rows={5}
          placeholder={s.key === 'appointment_holidays' ? 'One date per line: YYYY-MM-DD' : 'One appointment status per line'}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      );
    }
    if (s.key.startsWith('brand_')) {
      return (
        <div className="space-y-3">
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={e => setBrandAsset(s.key, e.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:font-medium file:text-teal-700 hover:file:bg-teal-100"
          />
          {val && <img src={val} alt={`${s.label} preview`} className="max-h-16 max-w-48 rounded border border-slate-200 bg-white p-1 object-contain" />}
          {val && <button type="button" onClick={() => setValue(s.key, '')} className="text-sm text-red-600 hover:underline">Remove image</button>}
        </div>
      );
    }
    if (typeof s.value === 'boolean' && s.key !== 'smtp_port') {
      return (
        <ToggleInput
          value={val === '' ? s.value : (typeof val === 'boolean' ? val : val === 'true')}
          onChange={e => setValue(s.key, e.target.checked)}
        />
      );
    }
    if (s.isSecret) {
      return (
        <div className="flex gap-2">
          <TextInput
            type={reveal[s.key] ? 'text' : 'password'}
            value={val}
            onChange={e => setValue(s.key, e.target.value)}
            placeholder="Enter new value to update"
          />
          <button type="button" onClick={() => setReveal(r => ({ ...r, [s.key]: !r[s.key] }))}
            className="text-slate-400 hover:text-slate-600">
            {reveal[s.key] ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      );
    }
    return (
      <TextInput
        value={String(val)}
        onChange={e => setValue(s.key, e.target.value)}
        type={typeof s.value === 'number' ? 'number' : 'text'}
        min={typeof s.value === 'number' ? 0 : undefined}
        step={typeof s.value === 'number' ? 1 : undefined}
        required={typeof s.value === 'number'}
        placeholder={s.label}
      />
    );
  };

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Settings size={26} className="text-teal-600" /> System Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">Configure operations, notifications, appearance, and system maintenance.</p>
        </div>

        {!tab && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map(({ id, label, description, icon: Icon }) => (
            <button
              type="button" key={id} onClick={() => setTab(id)}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:shadow-sm"
            >
              <span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon size={20} /></span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                <span className="mt-1 block text-xs text-slate-500">{description}</span>
              </span>
            </button>
          ))}
        </div>}

        {grouped.filter(g => g.id === tab).map(({ id, label, icon: Icon, items }) => (
          <form key={id} onSubmit={save} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setTab('')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">← All settings</button>
            </div>
            <div className="flex items-center gap-2">
              <Icon size={20} className="text-teal-600" />
              <h2 className="text-lg font-semibold text-slate-800">{label} Settings</h2>
            </div>
            <fieldset disabled={!canManage} className="bg-white rounded-xl shadow-sm p-6 space-y-5 disabled:opacity-75">
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">Settings are not available yet. Restart the backend to seed this category.</p>
              ) : items.map(s => (
                <Field key={s.key} label={s.label}>
                  {renderField(s)}
                </Field>
              ))}
            </fieldset>

            {tab === 'backup' && (
              <div className="space-y-4">
                <section className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-800">Database backups</h3>
                      <p className="mt-1 text-sm text-slate-500">Create a full JSON snapshot or download an existing backup.</p>
                    </div>
                    {canManage && <button type="button" onClick={createBackup} disabled={backupBusy}
                      className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                      <Database size={16} /> {backupBusy ? 'Working…' : 'Create backup now'}
                    </button>}
                  </div>
                  <div className="mt-4 divide-y divide-slate-100">
                    {backups.length === 0 ? (
                      <p className="py-4 text-sm text-slate-500">No backups yet.</p>
                    ) : backups.map(backup => (
                      <div key={backup.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{backup.name}</p>
                          <p className="text-xs text-slate-500">{new Date(backup.createdAt).toLocaleString()} · {(backup.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        {canManage && <button type="button" onClick={() => downloadBackup(backup.name)}
                          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Download size={16} /> Download
                        </button>}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                  <h3 className="font-semibold text-amber-900">Restore a database backup</h3>
                  <p className="mt-1 text-sm text-amber-800">Restore replaces current database collections. A safety backup is created first. This action cannot be undone.</p>
                  {canManage && <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input type="file" accept="application/json,.json" onChange={e => setRestoreFile(e.target.files?.[0] || null)}
                      className="block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
                    <input value={restoreConfirmation} onChange={e => setRestoreConfirmation(e.target.value)}
                      placeholder="Type RESTORE to confirm"
                      className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
                  </div>}
                  {canManage && <button type="button" onClick={restoreBackup} disabled={backupBusy || !restoreFile || restoreConfirmation !== 'RESTORE'}
                    className="mt-4 flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50">
                    <RotateCcw size={16} /> {backupBusy ? 'Restoring…' : 'Restore database'}
                  </button>}
                </section>
              </div>
            )}

            {tab === 'notification' && (
              <section className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-5 shadow-sm">
                <div className="min-w-52 flex-1">
                  <h3 className="font-semibold text-slate-800">Test notification providers</h3>
                  <p className="mt-1 text-xs text-slate-500">Save provider settings before sending a test.</p>
                </div>
                {canManage && <input type="tel" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Recipient phone number" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />}
                {canManage && <>
                <button type="button" onClick={() => testNotification('sms')} disabled={testingNotification}
                  className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Send size={15} /> Test SMS</button>
                <button type="button" onClick={() => testNotification('whatsapp')} disabled={testingNotification}
                  className="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Send size={15} /> Test WhatsApp</button>
                </>}
              </section>
            )}

            {tab === 'audit' && (
              <section className="overflow-x-auto rounded-xl bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="font-semibold text-slate-800">Recent audit events</h3>
                  <p className="mt-1 text-sm text-slate-500">Sensitive settings and operations are recorded without storing API secrets.</p>
                </div>
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Time', 'Actor', 'Action', 'Resource', 'Details'].map(item => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map(log => <tr key={log._id}>
                      <td className="px-4 py-3">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">{log.actorId?.name || log.actorId?.username || 'System'}</td>
                      <td className="px-4 py-3 font-medium">{log.action}</td>
                      <td className="px-4 py-3">{log.resource}{log.resourceId ? ` · ${log.resourceId}` : ''}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">{JSON.stringify(log.details || {})}</td>
                    </tr>)}
                    {!auditLogs.length && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No audit events recorded yet.</td></tr>}
                  </tbody>
                </table>
                {auditPagesTotal > 1 && (
                  <div className="border-t border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-slate-600">Records per page:</label>
                      <select 
                        value={auditLimit}
                        onChange={(e) => {
                          setAuditLimit(Number(e.target.value));
                          setAuditPage(1);
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white cursor-pointer hover:border-slate-400"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                    </div>
                    <p className="text-sm text-slate-600">Page {auditPage} of {auditPagesTotal}</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setAuditPage(p => Math.max(1, p - 1))} 
                        disabled={auditPage === 1}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-slate-50"
                      >
                        Previous
                      </button>
                      <button 
                        onClick={() => setAuditPage(p => Math.min(auditPagesTotal, p + 1))} 
                        disabled={auditPage === auditPagesTotal}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-slate-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <div className="flex gap-3 flex-wrap">
              {canManage && <button type="submit" disabled={saving || items.length === 0}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                <Save size={16} /> {saving ? 'Saving…' : 'Save Settings'}
              </button>}

              {canManage && tab === 'email' && (
                <div className="flex gap-2 items-center">
                  <input
                    type="email" value={testTo} onChange={e => setTestTo(e.target.value)}
                    placeholder="Send test to…"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button type="button" onClick={sendTest} disabled={testing}
                    className="flex items-center gap-2 bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
                    <Send size={16} /> {testing ? 'Sending…' : 'Test Email'}
                  </button>
                </div>
              )}
            </div>
          </form>
        ))}
      </div>
    </AdminLayout>
  );
}

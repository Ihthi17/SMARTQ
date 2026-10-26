import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { CalendarDays, Download, Eye, Mail, Pencil, RefreshCw, Trash2, X, CheckCircle, Send, QrCode } from 'lucide-react';
import NotificationCenter from '../../components/notifications/NotificationCenter';
import { buildAppointmentFormData } from '../../utils/appointmentFormData';

const STATUSES = ['all', 'booked', 'queued', 'called', 'in_service', 'completed', 'cancelled', 'no_show', 'pending', 'confirmed', 'checked_in', 'expired'];
const blankForm = { providerId: '', serviceCode: '', scheduledStart: '', customerName: '', customerEmail: '', customerPhone: '', assignedStaffId: '', notes: '' };
const dateInputValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const todayValue = () => new Date().toISOString().slice(0, 10);
const readableStatus = status => ({ 
  booked: 'Pending', 
  queued: 'Checked in', 
  called: 'Called', 
  in_service: 'In service', 
  no_show: 'No show',
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  expired: 'Expired'
}[status] || status);
const appointmentDate = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const requireArrayResponse = (data, resource) => {
  if (!Array.isArray(data) || data.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error(`Unexpected ${resource} response`);
  }
  return data;
};

export default function AppointmentManagement() {
  const { user, permissions } = useContext(AuthContext);
  const canManage = user?.role === 'SUPER_ADMIN' || (Array.isArray(permissions) && permissions.includes('appointments.manage'));
  const [appointments, setAppointments] = useState([]);
  const [providers, setProviders] = useState([]);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [status, setStatus] = useState('all');
  const [serviceCode, setServiceCode] = useState('');
  const [source, setSource] = useState('');
  const [staffId, setStaffId] = useState('');
  const [dateMode, setDateMode] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [intakeData, setIntakeData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [confirmingId, setConfirmingId] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmingBusy, setConfirmingBusy] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState('');
  const [reminderSentIds, setReminderSentIds] = useState(new Set()); // Track which appointments have reminders sent

  // Listen for appointment settings changes
  useEffect(() => {
    const handleSettingsUpdate = () => {
      // Reload appointments to apply new settings
      refresh();
    };
    
    window.addEventListener('smartqueue:appointment-settings-updated', handleSettingsUpdate);
    window.addEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    
    return () => {
      window.removeEventListener('smartqueue:appointment-settings-updated', handleSettingsUpdate);
      window.removeEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    };
  }, []);

  const serviceOptions = useMemo(
    () => serviceCatalog.filter(service => service.isActive && service.providerId && service.channels?.includes('appointments')),
    [serviceCatalog],
  );

  useEffect(() => {
    api.get('/providers')
      .then(({ data }) => setProviders(requireArrayResponse(data, 'service locations')))
      .catch(error => toast.error(error.response?.data?.message || error.message || 'Could not load service locations'));
  }, []);

  useEffect(() => {
    api.get('/services')
      .then(({ data }) => {
        const services = requireArrayResponse(data, 'services');
        // Ensure all services have providerId set
        const enrichedServices = services.map(service => {
          if (!service.providerId && service.providerCode) {
            // Try to find provider by code if providerId is missing
            const matchedProvider = providers.find(p => p.code === service.providerCode || p.branch?.code === service.providerCode);
            if (matchedProvider) {
              service.providerId = matchedProvider._id;
            }
          }
          return service;
        });
        setServiceCatalog(enrichedServices);
      })
      .catch(error => toast.error(error.response?.data?.message || error.message || 'Could not load services'));
  }, [providers]);

  useEffect(() => {
    api.get('/appointments/staff')
      .then(({ data }) => setStaffMembers(requireArrayResponse(data, 'staff list')))
      .catch(error => toast.error(error.response?.data?.message || error.message || 'Could not load staff list'));
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    const params = {
      ...(status !== 'all' && { status }),
      ...(serviceCode && { serviceCode }),
      ...(source && { source }),
      ...(staffId && { staffId }),
      ...(search && { search }),
      ...(dateMode === 'today' && { date: todayValue() }),
      ...(dateMode === 'range' && fromDate && { from: fromDate }),
      ...(dateMode === 'range' && toDate && { to: toDate }),
    };
    try {
      const appointmentsResponse = await api.get('/appointments', { params });
      setAppointments(requireArrayResponse(appointmentsResponse.data, 'appointments'));
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Could not load appointments');
    } finally { setBusy(false); }
  }, [status, serviceCode, source, staffId, dateMode, fromDate, toDate, search]);

  useEffect(() => { refresh(); }, [refresh]);

  const setPriority = async (appointment, priority) => {
    try {
      await api.patch(`/appointments/${appointment._id}/priority`, { priority });
      toast.success('Appointment priority updated');
      await refresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Could not update appointment'); }
  };

  const cancel = async (appointment) => {
    if (!window.confirm(`Cancel appointment ${appointment.tokenLabel}?`)) return;
    try {
      await api.post(`/appointments/${appointment._id}/cancel`, { reason: 'Cancelled by administrator' });
      toast.success('Appointment cancelled');
      await refresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Could not cancel appointment'); }
  };

  const reject = async appointment => {
    if (!window.confirm(`Reject appointment ${appointment.tokenLabel}?`)) return;
    try {
      await api.post(`/appointments/${appointment._id}/reject`, { reason: 'Rejected by administrator' });
      toast.success('Appointment rejected');
      await refresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Could not reject appointment'); }
  };

  const sendEmailAlert = async appointment => {
    try {
      const { data } = await api.post(`/appointments/${appointment._id}/email-alert`);
      toast.success(data.message);
      // Track that reminder was sent for this appointment
      setReminderSentIds(prev => new Set([...prev, appointment._id]));
    } catch (error) { toast.error(error.response?.data?.message || 'Could not send appointment email'); }
  };

  const deleteAppointment = async appointment => {
    if (!window.confirm(`Permanently delete appointment ${appointment.tokenLabel}? This cannot be undone.`)) return;
    setDeletingId(appointment._id);
    try {
      const { data } = await api.delete(`/appointments/${appointment._id}`);
      toast.success(data.message || 'Appointment deleted');
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete appointment');
    } finally { setDeletingId(''); }
  };

  const staffCheckIn = async appointment => {
    try {
      const { data } = await api.post(`/appointments/${appointment._id}/staff-check-in`, { token: appointment.qrToken });
      toast.success(data.message);
      await refresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Could not check in appointment'); }
  };

  const confirmAppointmentQR = async appointment => {
    if (!window.confirm(`Confirm appointment ${appointment.tokenLabel}? This opens the check-in window.`)) return;
    try {
      await api.patch(`/appointments/${appointment._id}/confirm`);
      toast.success('Appointment confirmed. Check-in window opened.');
      await refresh();
    } catch (error) { 
      toast.error(error.response?.data?.message || 'Could not confirm appointment'); 
    }
  };

  const checkInAppointmentQR = async appointment => {
    if (!window.confirm(`Check in appointment ${appointment.tokenLabel}?`)) return;
    try {
      const { data } = await api.post(`/appointments/${appointment._id}/checkin`);
      toast.success(`Checked in. Queue number: ${data.queueNumber}`);
      await refresh();
    } catch (error) { 
      toast.error(error.response?.data?.message || 'Could not check in appointment'); 
    }
  };

  const manualCheckInAppointmentQR = async appointment => {
    if (!window.confirm(`Manual check-in for appointment ${appointment.tokenLabel}?`)) return;
    try {
      const { data } = await api.patch(`/appointments/${appointment._id}/manual-checkin`);
      toast.success(`Manual check-in complete. Queue number: ${data.queueNumber}`);
      await refresh();
    } catch (error) { 
      toast.error(error.response?.data?.message || 'Could not check in appointment'); 
    }
  };

  const sendConfirmation = async () => {
    if (!confirmingId) return;
    setConfirmingBusy(true);
    try {
      const appointment = appointments.find(a => a._id === confirmingId);
      if (!appointment) throw new Error('Appointment not found');

      const { data } = await api.post(`/appointments/${confirmingId}/confirm`, {
        message: confirmMessage,
        queueNumber: appointment.tokenLabel || `Q${appointment.tokenNumber || ''}`,
      });
      
      toast.success('Appointment confirmed and message sent');
      setConfirmingId('');
      setConfirmMessage('');
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not confirm appointment');
    } finally {
      setConfirmingBusy(false);
    }
  };

  const handleRowAction = (appointment, action, event) => {
    if (action === 'check-in') staffCheckIn(appointment);
    if (action === 'confirm-qr') confirmAppointmentQR(appointment);
    if (action === 'checkin-qr') checkInAppointmentQR(appointment);
    if (action === 'manual-checkin-qr') manualCheckInAppointmentQR(appointment);
    if (action === 'priority') setPriority(appointment, appointment.priority === 'emergency' ? 'normal' : 'emergency');
    if (action === 'cancel') cancel(appointment);
    if (action === 'reject') reject(appointment);
    event.currentTarget.value = '';
  };

  const openCreate = () => {
    setEditing(null);
    setIntakeData({});
    setForm({ ...blankForm, serviceCode: serviceOptions[0]?.code || '', scheduledStart: dateInputValue(new Date(Date.now() + 60 * 60 * 1000)) });
    setFormOpen(true);
  };

  const openEdit = appointment => {
    setEditing(appointment);
    setIntakeData(appointment.intakeData || {});
    setForm({ ...blankForm, providerId: appointment.providerId?._id || '', serviceCode: appointment.serviceCode || '', scheduledStart: dateInputValue(new Date(appointment.scheduledStart)), customerName: appointment.customerName || '', customerEmail: appointment.customerEmail || '', customerPhone: appointment.customerPhone || '', assignedStaffId: appointment.assignedStaffId?._id || '', notes: appointment.notes || '' });
    setFormOpen(true);
  };

  const selectedService = serviceCatalog.find(service => service.code === form.serviceCode);
  const selectedProviderId = typeof selectedService?.providerId === 'object' ? selectedService?.providerId?._id : selectedService?.providerId;
  const selectedProvider = providers.find(provider => provider._id === String(selectedProviderId)) || (typeof selectedService?.providerId === 'object' ? selectedService.providerId : null);
  const requirements = selectedService?.requirements || [];
  const detailRequirements = serviceCatalog.find(service => service.code === details?.serviceCode)?.requirements || [];
  const downloadRequirementFile = async (appointment, fieldName, file) => {
    const key = `${appointment._id}:${fieldName}`;
    setDownloadingFile(key);
    try {
      const { data, headers } = await api.get(
        `/appointments/${encodeURIComponent(appointment._id)}/requirements/${encodeURIComponent(fieldName)}/${encodeURIComponent(file.fileId)}`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([data], { type: headers['content-type'] || file.mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName || 'appointment-attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not download appointment file');
    } finally {
      setDownloadingFile('');
    }
  };
  const saveAppointment = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        // Validate that edited appointment doesn't have expired time
        if (selectedService?.requiresDateTime !== false && form.scheduledStart) {
          const selected = new Date(form.scheduledStart);
          const now = new Date();
          if (selected.getTime() < now.getTime()) {
            toast.error('The appointment date/time cannot be in the past');
            setSaving(false);
            return;
          }
        }
        await api.patch(`/appointments/${editing._id}`, { customerName: form.customerName, customerEmail: form.customerEmail, customerPhone: form.customerPhone, assignedStaffId: form.assignedStaffId || null, scheduledStart: new Date(form.scheduledStart).toISOString(), notes: form.notes });
        toast.success('Appointment updated');
      } else {
        // Validate that new appointment doesn't have expired time
        if (selectedService?.requiresDateTime !== false && form.scheduledStart) {
          const selected = new Date(form.scheduledStart);
          const now = new Date();
          if (selected.getTime() < now.getTime()) {
            toast.error('The appointment date/time cannot be in the past');
            setSaving(false);
            return;
          }
        }
        const payload = {
          ...form,
          providerId: selectedService?.providerId || (typeof selectedService?.providerId === 'object' ? selectedService.providerId._id : selectedService?.providerId),
          branchCode: selectedProvider?.branch?.code || selectedProvider?.code || selectedService?.providerCode || '',
        };
        // Respect the service's date/time requirement: send a timestamp only when the
        // service requires it. Walk-in / flexible services send null (server uses now()).
        payload.scheduledStart = selectedService?.requiresDateTime !== false && form.scheduledStart
          ? new Date(form.scheduledStart).toISOString()
          : null;
        await api.post('/appointments', buildAppointmentFormData(payload, intakeData, requirements));
        toast.success('Appointment created');
      }
      setFormOpen(false);
      setEditing(null);
      await refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save appointment');
    } finally { setSaving(false); }
  };

  const counts = useMemo(() => ({
    today: appointments.filter(item => {
      if (!item || typeof item !== 'object') return false;
      const scheduledStart = appointmentDate(item.scheduledStart);
      return scheduledStart && scheduledStart.toISOString().slice(0, 10) === todayValue();
    }).length,
    pending: appointments.filter(item => {
      // Pending appointments are those not yet confirmed or checked in
      return ['booked', 'pending'].includes(item?.status);
    }).length,
    confirmed: appointments.filter(item => {
      // Confirmed appointments are those that have been confirmed but not yet checked in
      return ['called', 'in_service', 'confirmed'].includes(item?.status);
    }).length,
    checkedIn: appointments.filter(item => {
      // Checked-in appointments are in the queue
      return ['queued', 'checked_in'].includes(item?.status);
    }).length,
    completed: appointments.filter(item => item?.status === 'completed').length,
    cancelled: appointments.filter(item => item?.status === 'cancelled').length,
    noShow: appointments.filter(item => item?.status === 'no_show').length,
  }), [appointments]);

  const queueCounts = useMemo(() => ({
    waiting: appointments.filter(item => ['queued', 'checked_in'].includes(item?.status)).length,
    confirmed: appointments.filter(item => ['called', 'in_service', 'confirmed'].includes(item?.status)).length,
    completed: appointments.filter(item => item?.status === 'completed').length,
    total: appointments.filter(item => !['cancelled', 'no_show', 'expired'].includes(item?.status)).length,
  }), [appointments]);

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><CalendarDays className="text-teal-700" /> Appointment management</h1>
            <p className="mt-1 text-sm text-slate-500">Schedule, assign, track, and manage every customer appointment. Customer QR check-in is handled on the physical check-in display; admin check-in is the staff-assisted alternative.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} disabled={busy} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><RefreshCw size={15} /> Refresh</button>
            {canManage && <button onClick={openCreate} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">+ Create appointment</button>}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[["Today's appointments", counts.today], ['Pending', counts.pending], ['Confirmed', counts.confirmed], ['Checked in', counts.checkedIn], ['Completed', counts.completed], ['Cancelled', counts.cancelled], ['No show', counts.noShow]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>
          ))}
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border-2 border-teal-200 bg-teal-50 p-4">
            <p className="text-xs font-semibold uppercase text-teal-700">Total Queue</p>
            <p className="mt-2 text-3xl font-bold text-teal-900">{queueCounts.total}</p>
          </div>
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase text-blue-700">Waiting</p>
            <p className="mt-2 text-3xl font-bold text-blue-900">{queueCounts.waiting}</p>
          </div>
          <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
            <p className="text-xs font-semibold uppercase text-purple-700">Confirmed</p>
            <p className="mt-2 text-3xl font-bold text-purple-900">{queueCounts.confirmed}</p>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-700">Completed</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{queueCounts.completed}</p>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <select value={dateMode} onChange={event => setDateMode(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="all">All dates</option><option value="today">Today</option><option value="range">Date range</option></select>
            <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm">{STATUSES.map(item => <option key={item} value={item}>{item === 'all' ? 'All statuses' : readableStatus(item)}</option>)}</select>
            <select value={serviceCode} onChange={event => setServiceCode(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">All services</option>{serviceOptions.map(service => <option key={service.code} value={service.code}>{service.name || service.code}</option>)}</select>
            <select value={staffId} onChange={event => setStaffId(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">All staff</option>{staffMembers.map(staff => <option key={staff._id} value={staff._id}>{staff.name || staff.username}</option>)}</select>
            <select value={source} onChange={event => setSource(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">All sources</option><option value="online">Online</option><option value="admin">Admin</option></select>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, phone, email" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm lg:col-span-1" />
          </div>
          {dateMode === 'range' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>Date range:</span>
              <input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setDateMode('range'); }} className="rounded-lg border border-slate-300 px-3 py-2" />
              <span>to</span>
              <input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setDateMode('range'); }} className="rounded-lg border border-slate-300 px-3 py-2" />
            </div>
          )}
          {(status !== 'all' || serviceCode || staffId || source || search) && (
            <div className="text-xs text-slate-500">
              Showing appointments: {appointments.length} total
            </div>
          )}
        </section>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Appointment', 'Customer', 'Service / staff', 'Date & time', 'Status', 'Created', 'Actions'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map(appointment => (
                <tr key={appointment._id} className="align-top">
                  <td className="px-4 py-4 font-semibold text-teal-800">{appointment.tokenLabel || String(appointment._id || '').slice(-8) || '—'}<p className="mt-1 text-xs font-normal text-slate-400">{appointment.createdVia === 'admin' ? 'admin' : 'online'}</p></td>
                  <td className="px-4 py-4">{appointment.customerName || '—'}<p className="mt-1 text-xs text-slate-500">{appointment.customerPhone || appointment.customerEmail || '—'}</p></td>
                  <td className="px-4 py-4">{appointment.serviceCode || '—'}<p className="mt-1 text-xs text-slate-500">{appointment.providerId?.name || '—'} · {appointment.assignedStaffId?.name || 'Unassigned'}</p></td>
                  <td className="px-4 py-4">{appointment.hasScheduledTime === false ? <span className="text-slate-400">—</span> : <>{appointmentDate(appointment.scheduledStart)?.toLocaleDateString() || '—'}<p className="mt-1 text-xs text-slate-500">{appointmentDate(appointment.scheduledStart)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '—'}</p></>}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${appointment.status === 'pending' ? 'bg-amber-100 text-amber-800' : appointment.status === 'booked' ? 'bg-yellow-100 text-yellow-800' : appointment.status === 'confirmed' ? 'bg-blue-100 text-blue-800' : appointment.status === 'queued' || appointment.status === 'checked_in' ? 'bg-green-100 text-green-800' : appointment.status === 'called' ? 'bg-purple-100 text-purple-800' : appointment.status === 'in_service' ? 'bg-indigo-100 text-indigo-800' : appointment.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : appointment.status === 'cancelled' ? 'bg-slate-200 text-slate-700' : appointment.status === 'no_show' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{readableStatus(appointment.status)}</span></td>
                  <td className="px-4 py-4 text-xs text-slate-500">{new Date(appointment.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Notification status indicators - show mail icon ONLY when reminder manually sent */}
                      <div className="flex gap-1">
                        {reminderSentIds.has(appointment._id) && <span title="Reminder email sent to customer" className="inline-flex items-center justify-center rounded-full bg-green-100 p-1.5 text-green-700"><Mail size={14} /></span>}
                      </div>
                      {canManage && <select aria-label={`Actions for ${appointment.tokenLabel || 'appointment'}`} defaultValue="" onChange={event => handleRowAction(appointment, event.target.value, event)} className="rounded-md border border-teal-300 bg-white px-2 py-1.5 text-xs text-teal-800">
                        <option value="" disabled>Actions</option>
                        {/* Legacy statuses */}
                        {appointment.status === 'booked' && <option value="confirm">Confirm & send queue number</option>}
                        {appointment.status === 'booked' && <option value="check-in">Staff-assisted check-in</option>}
                        {/* New QR check-in statuses */}
                        {appointment.status === 'pending' && <option value="confirm-qr">Confirm appointment</option>}
                        {appointment.status === 'confirmed' && <option value="checkin-qr">✓ Check-in via QR</option>}
                        {appointment.status === 'confirmed' && <option value="manual-checkin-qr">✓ Manual check-in</option>}
                        {['booked', 'pending', 'confirmed'].includes(appointment.status) && <option value="reject">Reject appointment</option>}
                        {/* Priority and cancel options */}
                        {['booked', 'queued', 'pending', 'confirmed', 'checked_in'].includes(appointment.status) && <option value="priority">{appointment.priority === 'emergency' ? 'Remove emergency priority' : 'Mark emergency priority'}</option>}
                        {['booked', 'queued', 'called', 'pending', 'confirmed', 'checked_in'].includes(appointment.status) && <option value="cancel">Cancel appointment</option>}
                      </select>}
                      <button onClick={() => setDetails(appointment)} title="View details" aria-label="View details" className="rounded-md border border-slate-300 p-1.5"><Eye size={15} /></button>
                      {canManage && appointment.status === 'booked' && <button onClick={() => openEdit(appointment)} title="Edit appointment" aria-label="Edit appointment" className="rounded-md border border-blue-200 p-1.5 text-blue-700"><Pencil size={15} /></button>}
                      {canManage && appointment.customerEmail && <button onClick={() => sendEmailAlert(appointment)} title={appointment.status === 'booked' ? 'Resend appointment email with check-in QR code' : 'Send appointment email update'} aria-label={appointment.status === 'booked' ? 'Resend appointment email with check-in QR code' : 'Send appointment email update'} className="rounded-md border border-sky-200 p-1.5 text-sky-700"><Mail size={15} /></button>}
                      {canManage && <button
                        onClick={() => deleteAppointment(appointment)}
                        disabled={deletingId === appointment._id || ['queued', 'called', 'in_service', 'checked_in'].includes(appointment.status)}
                        title={['queued', 'called', 'in_service', 'checked_in'].includes(appointment.status) ? 'Cancel or complete the active queue entry before deleting' : 'Delete appointment'}
                        aria-label={`Delete appointment ${appointment.tokenLabel || ''}`}
                        className="rounded-md border border-red-200 p-1.5 text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      ><Trash2 size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!busy && appointments.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-500">No appointments match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {(formOpen || details) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) { setFormOpen(false); setDetails(null); } }}>
        <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
          <header className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{details ? 'Appointment details' : editing ? 'Edit appointment' : 'Create appointment'}</h2><button onClick={() => { setFormOpen(false); setDetails(null); }} aria-label="Close"><X size={20} /></button></header>
          {details ? (
            <>
              <dl className="mb-6 grid gap-4 sm:grid-cols-2">
                {[['Reference', details.tokenLabel], ['Customer', details.customerName], ['Phone', details.customerPhone], ['Email', details.customerEmail], ['Location', details.providerId?.name], ['Service', details.serviceCode], ['Staff', details.assignedStaffId?.name || 'Unassigned'], ['Date and time', details.hasScheduledTime === false ? '—' : new Date(details.scheduledStart).toLocaleString()], ['Status', details.status], ['Source', details.createdVia], ['Priority', details.priority], ['Notes', details.notes]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value || '—'}</dd></div>)}
                {Object.entries(details.intakeData || {}).map(([key, value]) => {
                  const label = detailRequirements.find(field => field.name === key)?.label || key.replaceAll('_', ' ');
                  const isFile = value && typeof value === 'object' && typeof value.fileId === 'string';
                  return <div key={key}>
                    <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {isFile ? <span className="flex flex-wrap items-center gap-2">
                        <span>{value.originalName}</span>
                        <button type="button" onClick={() => downloadRequirementFile(details, key, value)} disabled={downloadingFile === `${details._id}:${key}`} className="inline-flex items-center gap-1 rounded border border-teal-200 px-2 py-1 text-xs font-medium text-teal-800 disabled:opacity-50">
                          <Download size={13} />{downloadingFile === `${details._id}:${key}` ? 'Loading…' : 'Download'}
                        </button>
                      </span> : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || '—'}
                    </dd>
                  </div>;
                })}
              </dl>
              
              <div className="border-t border-slate-200 pt-4">
                <h3 className="font-semibold text-slate-900 mb-3">Send Notifications</h3>
                <NotificationCenter 
                  appointmentId={details._id} 
                  customerPhone={details.customerPhone}
                  customerEmail={details.customerEmail}
                />
              </div>
            </>
          ) : (
            <form onSubmit={saveAppointment} className="grid gap-4 sm:grid-cols-2">
              {!editing && <label className="text-sm font-medium text-slate-700 sm:col-span-2">Service<select required value={form.serviceCode} onChange={event => { setForm(old => ({ ...old, serviceCode: event.target.value })); setIntakeData({}); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Choose a service</option>{serviceOptions.map(service => <option key={service.code} value={service.code}>{service.name} · {service.providerName || providers.find(provider => provider._id === String(service.providerId))?.name || 'Location unavailable'}</option>)}</select>{serviceOptions.length === 0 && <span className="mt-1 block text-xs text-amber-700">Create a service and assign its location in Service Management before booking.</span>}</label>}
              {editing && <label className="text-sm font-medium text-slate-700 sm:col-span-2">Staff<select value={form.assignedStaffId} onChange={event => setForm(old => ({ ...old, assignedStaffId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Unassigned</option>{staffMembers.map(staff => <option key={staff._id} value={staff._id}>{staff.name || staff.username}</option>)}</select></label>}
              {!editing && requirements.map(field => <label key={`${selectedService?.code}-${field.name}`} className={`text-sm font-medium text-slate-700 ${field.type === 'file' ? 'sm:col-span-2' : ''}`}>{field.label}{field.required ? ' *' : ''}{field.type === 'select' ? <select required={field.required} value={intakeData[field.name] || ''} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Choose an option</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" required={field.required} checked={Boolean(intakeData[field.name])} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.checked }))} className="ml-2 h-4 w-4 rounded border-slate-300 text-teal-700" /> : field.type === 'textarea' ? <textarea required={field.required} value={intakeData[field.name] || ''} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /> : field.type === 'file' ? <><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required={field.required} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.files?.[0] || null }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /><span className="mt-1 block text-xs font-normal text-slate-500">PDF, JPG, PNG, or WebP · up to 5 MB</span></> : <input type={field.type} required={field.required} value={intakeData[field.name] || ''} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />}</label>)}
              <label className="text-sm font-medium text-slate-700">Customer name<input required maxLength={150} value={form.customerName} onChange={event => setForm(old => ({ ...old, customerName: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Phone{!editing && ' *'}<input type="tel" required={!editing} maxLength={30} value={form.customerPhone} onChange={event => setForm(old => ({ ...old, customerPhone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Email{!editing && ' *'}<input type="email" required={!editing} value={form.customerEmail} onChange={event => setForm(old => ({ ...old, customerEmail: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              {(editing || selectedService?.requiresDateTime !== false) && <label className="text-sm font-medium text-slate-700 sm:col-span-2">Appointment date and time<input type="datetime-local" required={editing || selectedService?.requiresDateTime !== false} min={dateInputValue(new Date())} value={form.scheduledStart} onChange={event => setForm(old => ({ ...old, scheduledStart: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
              {!editing && selectedService?.requiresDateTime === false && <p className="text-xs text-slate-500 sm:col-span-2">This is a walk-in / flexible service — no appointment date and time is required.</p>}
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes<textarea maxLength={2000} value={form.notes} onChange={event => setForm(old => ({ ...old, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <footer className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create appointment'}</button></footer>
            </form>
          )}
        </section>
      </div>}

      {confirmingId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmingId(''); }}>
        <section className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <CheckCircle size={24} className="text-teal-600" />
            <h2 className="text-lg font-semibold text-slate-900">Confirm Appointment</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">Confirm this appointment and send the queue number to the customer via SMS, WhatsApp, or Email.</p>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Confirmation Message
              <textarea
                value={confirmMessage}
                onChange={e => setConfirmMessage(e.target.value)}
                rows="4"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Enter confirmation message for customer"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingId('')}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={sendConfirmation}
                disabled={confirmingBusy || !confirmMessage.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                <Send size={16} />
                {confirmingBusy ? 'Sending…' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </section>
      </div>}
    </AdminLayout>
  );
}

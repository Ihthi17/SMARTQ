import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { buildAppointmentFormData } from '../../utils/appointmentFormData';

const defaultStart = () => {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  value.setHours(9, 0, 0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const getMinDateTime = () => {
  const now = new Date();
  // Round up to next 30-minute slot to ensure we never allow "now"
  const minutes = now.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 30) * 30;
  now.setMinutes(roundedMinutes, 0, 0);
  if (minutes !== 0 && minutes % 30 !== 0) {
    now.setTime(now.getTime() + (60000 - now.getMilliseconds()));
  }
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const isExpiredDateTime = (dateTimeString) => {
  if (!dateTimeString) return false;
  const selected = new Date(dateTimeString);
  const now = new Date();
  // Allow 5 minutes buffer for timezone issues
  return selected.getTime() < (now.getTime() - 5 * 60000);
};

export default function BookAppointment() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [intakeData, setIntakeData] = useState({});
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [form, setForm] = useState({
    serviceCode: '', scheduledStart: defaultStart(),
    customerName: '', customerEmail: '', customerPhone: '',
  });

  const loadServices = async () => {
    setLoading(true);
    try {
      // Try to check maintenance mode, but don't fail if can't access
      let isMaintenance = false;
      try {
        const systemSettings = await api.get('/settings?group=system');
        const maintenanceSetting = Array.isArray(systemSettings.data) 
          ? systemSettings.data.find(s => s.key === 'system_maintenance_mode')
          : null;
        isMaintenance = maintenanceSetting?.value === true || maintenanceSetting?.value === 'true';
      } catch (settingsError) {
        // If we can't get system settings, assume maintenance mode is off
        console.warn('Could not check maintenance mode:', settingsError);
        isMaintenance = false;
      }
      
      setMaintenanceMode(isMaintenance);

      if (isMaintenance) {
        setServices([]);
        return;
      }

      // Load services
      const { data } = await api.get('/services');
      
      // Try to get service settings, but don't fail if can't access
      let allowOnlineBooking = true;
      try {
        const serviceSettings = await api.get('/settings?group=service');
        allowOnlineBooking = Array.isArray(serviceSettings.data)
          ? serviceSettings.data.find(s => s.key === 'service_allow_online_booking')?.value !== false
          : true;
      } catch (settingsError) {
        // If we can't get service settings, default to allowing online booking
        console.warn('Could not check online booking setting:', settingsError);
        allowOnlineBooking = true;
      }

      setServices(data.filter(service =>
        service.isActive && service.providerId && service.channels?.includes('appointments') && allowOnlineBooking,
      ));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  // Listen for appointment settings changes
  useEffect(() => {
    const handleSettingsUpdate = () => {
      loadServices();
    };
    
    window.addEventListener('smartqueue:appointment-settings-updated', handleSettingsUpdate);
    window.addEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    
    return () => {
      window.removeEventListener('smartqueue:appointment-settings-updated', handleSettingsUpdate);
      window.removeEventListener('smartqueue:settings-updated', handleSettingsUpdate);
    };
  }, []);

  const selectedService = services.find(service => service.code === form.serviceCode);
  const requirements = selectedService?.requirements || [];

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      // Validate date/time if service requires it
      if (selectedService?.requiresDateTime !== false && !form.scheduledStart) {
        toast.error('Please select a date and time for your appointment');
        setSubmitting(false);
        return;
      }

      // Check if selected date/time has already passed
      if (selectedService?.requiresDateTime !== false && isExpiredDateTime(form.scheduledStart)) {
        toast.error('The selected date and time has already passed. Please choose a future date and time.');
        setSubmitting(false);
        return;
      }

      const formData = {
        ...form,
        providerId: selectedService?.providerId,
        branchCode: selectedService?.providerCode,
      };

      // Send a timestamp only when the service requires date/time. Walk-in / flexible
      // services always send null so the appointment is marked hasScheduledTime: false.
      formData.scheduledStart = selectedService?.requiresDateTime !== false && form.scheduledStart
        ? new Date(form.scheduledStart).toISOString()
        : null;

      const response = await api.post('/appointments', buildAppointmentFormData(formData, intakeData, requirements));
      
      setConfirmation(response.data);
      
      if (response.data.notificationDelivery?.email === 'failed') {
        toast.error('Appointment saved, but the confirmation email could not be sent.');
      } else {
        toast.success('Appointment created! Check your email for next steps.');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Appointment booking failed');
    } finally { setSubmitting(false); }
  };

  if (confirmation) {
    const { appointment, provider: bookedAt, notificationDelivery } = confirmation;
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <Toaster position="top-right" />
        <section className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-center shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Appointment created</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Reference ID</h1>
          <p className="mt-2 font-mono text-lg text-slate-600 break-all">{appointment._id}</p>
          <p className="mt-4 text-slate-600">{bookedAt.name} · {appointment.serviceCode}</p>
          <p className="mt-1 text-sm text-slate-500">{new Date(appointment.scheduledStart).toLocaleString()}</p>
          
          <div className="mt-6 rounded-lg bg-teal-50 p-4 border border-teal-200">
            <p className="text-sm text-teal-800">
              <strong>✓ Appointment created!</strong>
            </p>
            <p className="mt-2 text-sm text-teal-700">
              A confirmation email has been sent to <strong>{appointment.customerEmail}</strong>
            </p>
            <p className="mt-2 text-xs text-teal-600">
              Admin will confirm your appointment and send you a queue token with the check-in QR code.
            </p>
          </div>
          
          {notificationDelivery?.email && (
            <p className="mt-4 text-xs text-slate-500">
              📧 Email notification: <strong>{notificationDelivery.email}</strong>
            </p>
          )}
          {notificationDelivery?.sms && (
            <p className="mt-1 text-xs text-slate-500">
              📱 SMS notification: <strong>{notificationDelivery.sms}</strong>
            </p>
          )}
          
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => navigate('/')} className="rounded-lg bg-slate-600 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Return Home
            </button>
            <button onClick={() => navigate('/live-queue')} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
              View Live Queue
            </button>
          </div>
          
          <p className="mt-6 text-xs text-slate-500">
            Save your reference ID. You'll need it to track your appointment status.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <Toaster position="top-right" />
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Smart Queue</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Book an appointment</h1>
          <p className="mt-2 text-sm text-slate-500">Choose a service. Its assigned location is set up in Service Management, and we’ll email your check-in QR code.</p>
        </div>
        {maintenanceMode ? (
          <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">The system is currently in maintenance mode. Appointment booking is temporarily unavailable. Please try again later.</p>
        ) : loading ? <p className="text-sm text-slate-500">Loading services…</p> : services.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">No appointment services with an assigned location are available yet.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Service</span>
              <select value={form.serviceCode} onChange={e => { setForm(old => ({ ...old, serviceCode: e.target.value })); setIntakeData({}); }} required className="w-full rounded-lg border border-slate-300 px-3 py-2.5">
                <option value="">Choose a service</option>
                {services.map(service => <option key={service.code} value={service.code}>{service.name}</option>)}
              </select>
              {selectedService && (
                <div className="mt-2 space-y-1">
                  <span className="block text-xs text-slate-500">📍 Location: {selectedService.providerName || selectedService.providerCode}</span>
                  {selectedService.requiresDateTime !== false && (
                    <span className="block text-xs text-slate-500">🕐 You'll need to select a specific date and time</span>
                  ) || (
                    <span className="block text-xs text-teal-600">👥 Walk-in service - no specific appointment time required</span>
                  )}
                </div>
              )}
            </label>
            {requirements.map(field => <label key={`${selectedService?.code}-${field.name}`} className={field.type === 'textarea' || field.type === 'file' ? 'sm:col-span-2' : ''}>
              <span className="mb-1 block text-sm font-medium text-slate-700">{field.label}{field.required ? ' *' : ''}</span>
              {field.type === 'select' ? <select required={field.required} value={intakeData[field.name] || ''} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5"><option value="">Choose an option</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
                : field.type === 'textarea' ? <textarea required={field.required} maxLength={2000} value={intakeData[field.name] || ''} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                  : field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(intakeData[field.name])} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.checked }))} required={field.required} className="h-4 w-4 rounded border-slate-300 text-teal-700" />
                    : field.type === 'file' ? <><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required={field.required} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.files?.[0] || null }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /><span className="mt-1 block text-xs font-normal text-slate-500">PDF, JPG, PNG, or WebP · up to 5 MB</span></>
                    : <input type={field.type} required={field.required} value={intakeData[field.name] || ''} onChange={event => setIntakeData(old => ({ ...old, [field.name]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />}
            </label>)}
            {selectedService?.requiresDateTime !== false && (
              <label className="sm:col-span-2">
                <span className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    <CalendarDays size={15} className="inline mr-1" />
                    Appointment date and time
                  </span>
                  <span className="text-xs font-semibold text-red-600">*</span>
                </span>
                <input 
                  type="datetime-local" 
                  value={form.scheduledStart} 
                  min={getMinDateTime()} 
                  onChange={e => setForm(old => ({ ...old, scheduledStart: e.target.value }))} 
                  required 
                  className={`w-full rounded-lg border px-3 py-2.5 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 ${
                    isExpiredDateTime(form.scheduledStart) 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-slate-300'
                  }`}
                />
                {isExpiredDateTime(form.scheduledStart) && (
                  <span className="mt-1 block text-xs text-red-600 font-medium">
                    ⚠️ This date and time has already passed. Please select a future date and time.
                  </span>
                )}
                {!isExpiredDateTime(form.scheduledStart) && (
                  <span className="mt-1 block text-xs text-slate-500">Select your preferred appointment date and time. Must be in the future.</span>
                )}
              </label>
            )}
            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">Your name</span>
              <input value={form.customerName} onChange={e => setForm(old => ({ ...old, customerName: e.target.value }))} required maxLength={150} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label>
              <span className="mb-1 block text-sm font-medium text-slate-700">Phone number *</span>
              <input type="tel" value={form.customerPhone} onChange={e => setForm(old => ({ ...old, customerPhone: e.target.value }))} required maxLength={30} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email address *</span>
              <input type="email" value={form.customerEmail} onChange={e => setForm(old => ({ ...old, customerEmail: e.target.value }))} required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              <span className="mt-1 block text-xs text-slate-500">Your appointment confirmation and check-in QR code will be sent here.</span>
            </label>
            <button type="submit" disabled={submitting || !selectedService || !form.serviceCode || (selectedService?.requiresDateTime !== false && isExpiredDateTime(form.scheduledStart))} className="sm:col-span-2 rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Booking…' : isExpiredDateTime(form.scheduledStart) ? 'Invalid date/time' : 'Book appointment'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

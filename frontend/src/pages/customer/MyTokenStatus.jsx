import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, MapPin } from 'lucide-react';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';

export default function MyTokenStatus() {
  const [params] = useSearchParams();
  const [appointmentId, setAppointmentId] = useState(params.get('appointmentId') || '');
  const [token, setToken] = useState(params.get('token') || '');
  const [branchCode, setBranchCode] = useState(params.get('branchCode') || '');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const checkIn = useCallback(async (event) => {
    event?.preventDefault();
    if (!appointmentId || !token) return toast.error('Appointment QR code is incomplete');
    setBusy(true);
    try {
      if (!navigator.geolocation) throw new Error('Location check-in requires an HTTPS connection and browser location access.');
      const coordinates = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        error => reject(new Error(error.code === error.PERMISSION_DENIED
          ? 'Allow location access to check in at the appointment location.'
          : 'Could not read your location. Try again outdoors.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      ));
      const response = await api.post(`/appointments/${encodeURIComponent(appointmentId)}/check-in`, { token, coordinates, branchCode });
      setResult(response.data);
      toast.success(response.data.message);
    } catch (error) {
      if (error instanceof Error && !error.response) {
        toast.error(error.message);
        return;
      }
      if (error.response?.status === 409 &&
          error.response?.data?.message?.includes('already been checked in')) {
        try {
          const status = await api.get(`/appointments/${encodeURIComponent(appointmentId)}/status`, { params: { token } });
          if (['queued', 'called', 'in_service'].includes(status.data.appointment.status)) {
            setResult({ ...status.data, message: 'This appointment is already checked in.' });
          } else {
            toast.error('This appointment can no longer be checked in.');
          }
          return;
        } catch (statusError) {
          toast.error(statusError.response?.data?.message || 'Could not retrieve appointment status');
          return;
        }
      }
      toast.error(error.response?.data?.message || 'Check-in failed');
    } finally { setBusy(false); }
  }, [appointmentId, token, branchCode]);

  useEffect(() => {
    if (params.get('appointmentId') && params.get('token') && !attempted) {
      setAttempted(true);
      checkIn();
    }
  }, [attempted, checkIn, params]);

  const appointment = result?.appointment;
  const queue = result?.queue;

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <Toaster position="top-right" />
      <section className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Smart Queue</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Location check-in</h1>
        {!result ? (
          <>
            <p className="mt-2 text-sm text-slate-500">Open the QR code from your confirmation email at the appointment location. Location access is required to join the queue.</p>
            <form onSubmit={checkIn} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Appointment ID</span>
                <input value={appointmentId} onChange={e => setAppointmentId(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Check-in code</span>
                <input value={token} onChange={e => setToken(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700"><MapPin size={15} className="mr-1 inline" />Location code</span>
                <input value={branchCode} onChange={e => setBranchCode(e.target.value.toUpperCase())} required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <button type="submit" disabled={busy} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Checking in…' : 'Confirm check-in'}</button>
            </form>
          </>
        ) : (
          <div className="mt-6">
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 size={24} />
              <div><p className="font-semibold">{result.message}</p><p className="text-sm">You are checked in at {appointment?.branchCode}.</p></div>
            </div>
            <div className="mt-4 rounded-xl bg-slate-950 p-5 text-white">
              <p className="text-xs uppercase tracking-wider text-teal-200">Your queue token</p>
              <p className="mt-2 text-4xl font-extrabold">{appointment?.tokenLabel}</p>
              <p className="mt-2 text-sm text-slate-300">{appointment?.serviceCode} · {appointment?.status}</p>
              <p className="mt-1 text-sm text-slate-300">Waiting ahead: {queue?.waitingCount ?? 0}</p>
              {appointment?.estimatedWaitMinutes != null && <p className="mt-1 text-sm text-slate-300">Estimated wait: {appointment.estimatedWaitMinutes} min</p>}
            </div>
            <button type="button" onClick={() => { setResult(null); setAttempted(false); }} className="mt-4 text-sm font-medium text-teal-700 hover:underline">Check another appointment</button>
          </div>
        )}
      </section>
    </main>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { useQueueSocket } from '../../hooks/useQueueSocket';
import { Activity, AlertCircle, CheckCircle, Clock, MapPin, RefreshCw } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export default function QueueStatus() {
  const { appointmentId } = useParams();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState(null);
  const [providerId, setProviderId] = useState(null);
  const [branchCode, setBranchCode] = useState(null);
  const [serviceCode, setServiceCode] = useState(null);

  const loadAppointment = useCallback(async () => {
    try {
      const { data } = await api.get(`/appointments/${appointmentId}/status`);
      setAppointment(data);
      if (data.providerId) {
        setProviderId(data.providerId._id || data.providerId);
        setBranchCode(data.providerId?.branch?.code || data.providerId?.code);
        setServiceCode(data.serviceCode);
      }
      return data;
    } catch (error) {
      toast.error('Could not load appointment status');
      return null;
    }
  }, [appointmentId]);

  useEffect(() => {
    loadAppointment().then(() => {
      setLoading(false);
    });
  }, [loadAppointment]);

  // Use the queue socket hook
  const { queue: socketQueue, connected } = useQueueSocket(
    providerId,
    branchCode,
    serviceCode,
    appointment?.scheduledStart ? new Date(appointment.scheduledStart).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    null
  );

  useEffect(() => {
    if (socketQueue) {
      setQueue(socketQueue);
    }
  }, [socketQueue]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-200 border-t-teal-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your queue status…</p>
        </div>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Appointment Not Found</h1>
          <p className="text-slate-600">We couldn't find your appointment. Please check your booking reference.</p>
        </div>
      </div>
    );
  }

  const statusColor = {
    booked: 'bg-amber-100 text-amber-900 border-amber-300',
    queued: 'bg-blue-100 text-blue-900 border-blue-300',
    called: 'bg-purple-100 text-purple-900 border-purple-300',
    in_service: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    completed: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    cancelled: 'bg-red-100 text-red-900 border-red-300',
    no_show: 'bg-gray-100 text-gray-900 border-gray-300',
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'booked':
        return <Clock size={20} />;
      case 'queued':
      case 'called':
        return <Activity size={20} />;
      case 'in_service':
        return <Clock size={20} />;
      case 'completed':
        return <CheckCircle size={20} />;
      default:
        return <AlertCircle size={20} />;
    }
  };

  const getStatusText = (status) => {
    const statuses = {
      booked: 'Booking Confirmed',
      queued: 'Checked In',
      called: 'Called to Service',
      in_service: 'In Service',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No Show',
    };
    return statuses[status] || status;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <Toaster position="top-right" />
      
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="rounded-t-2xl bg-white shadow-md p-6 sm:p-8 border-b-4 border-teal-600">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{appointment.tokenLabel || `Q${appointment.tokenNumber}`}</h1>
              <p className="mt-2 text-sm text-slate-500">{appointment.serviceCode}</p>
            </div>
            <div className={`rounded-lg p-3 flex items-center gap-2 border-2 ${statusColor[appointment.status] || 'bg-slate-100 text-slate-900 border-slate-300'}`}>
              {getStatusIcon(appointment.status)}
              <span className="font-semibold">{getStatusText(appointment.status)}</span>
            </div>
          </div>

          {/* Real-time indicator */}
          <div className="mb-4 flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
            <span className="text-xs font-medium text-slate-600">
              {connected ? 'Live updates' : 'Connecting...'}
            </span>
          </div>

          {/* Customer Info */}
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-slate-600 font-medium">Customer Name</p>
            <p className="text-lg font-semibold text-slate-900">{appointment.customerName}</p>
          </div>

          {/* Location & Service */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase font-semibold text-slate-500">Location</p>
              <div className="mt-1 flex items-center gap-2 text-slate-800">
                <MapPin size={16} />
                <span className="font-medium">{appointment.providerId?.name || 'Location'}</span>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase font-semibold text-slate-500">Appointment Time</p>
              <p className="mt-1 font-medium text-slate-800">{new Date(appointment.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
        </div>

        {/* Queue Status */}
        {queue && (
          <div className="bg-white shadow-md p-6 sm:p-8 space-y-6">
            {isCurrentlyServing && (
              <div className="rounded-lg bg-emerald-50 border-2 border-emerald-500 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={20} className="text-emerald-600" />
                  <p className="font-semibold text-emerald-900">You are now being served!</p>
                </div>
                <p className="text-sm text-emerald-800">Please proceed to the service counter.</p>
              </div>
            )}

            {isNextInQueue && (
              <div className="rounded-lg bg-blue-50 border-2 border-blue-500 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={20} className="text-blue-600" />
                  <p className="font-semibold text-blue-900">You're next in queue!</p>
                </div>
                <p className="text-sm text-blue-800">Please be ready. You will be called soon.</p>
              </div>
            )}

            {tokenPosition !== undefined && tokenPosition >= 0 && (
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-slate-600 font-medium mb-1">Your Position</p>
                <p className="text-3xl font-bold text-teal-600">{tokenPosition + 1}th in queue</p>
                {tokenPosition > 0 && (
                  <p className="mt-2 text-sm text-slate-600">
                    Approximately {tokenPosition * 5} minutes wait time
                  </p>
                )}
              </div>
            )}

            {/* Queue Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-center">
                <p className="text-xs font-semibold uppercase text-teal-700">Total in Queue</p>
                <p className="mt-1 text-2xl font-bold text-teal-900">{queue.total || 0}</p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="text-xs font-semibold uppercase text-blue-700">Waiting</p>
                <p className="mt-1 text-2xl font-bold text-blue-900">{queue.waitingCount || 0}</p>
              </div>
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-center">
                <p className="text-xs font-semibold uppercase text-purple-700">Confirmed</p>
                <p className="mt-1 text-2xl font-bold text-purple-900">{queue.confirmed || 0}</p>
              </div>
            </div>

            {/* Current & Next */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-4 text-white" style={{ backgroundColor: '#0f766e' }}>
                <p className="text-xs font-semibold uppercase text-white/80">Now Serving</p>
                <p className="mt-2 text-3xl font-bold">{queue.current?.tokenLabel || '—'}</p>
              </div>
              <div className="rounded-lg p-4 text-white" style={{ backgroundColor: '#7c3aed' }}>
                <p className="text-xs font-semibold uppercase text-white/80">Next Queue</p>
                <p className="mt-2 text-3xl font-bold">{queue.next?.tokenLabel || '—'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="rounded-b-2xl bg-white shadow-md p-6 sm:p-8 border-t border-slate-200">
          <h2 className="font-semibold text-slate-900 mb-3">Instructions</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <span className="text-teal-600 font-bold">1.</span>
              <span>Wait for your queue number to be called</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-600 font-bold">2.</span>
              <span>Keep this page open to track your position</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-600 font-bold">3.</span>
              <span>When called, proceed to the service counter</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-600 font-bold">4.</span>
              <span>If you don't arrive within 5 minutes, you may be marked as no-show</span>
            </li>
          </ul>
        </div>

        {/* Refresh Button */}
        <div className="mt-6 text-center">
          <button
            onClick={() => loadAppointment()}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 font-medium transition-colors"
          >
            <RefreshCw size={16} />
            Refresh Status
          </button>
        </div>
      </div>
    </div>
  );
}

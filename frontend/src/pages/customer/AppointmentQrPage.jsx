import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode.react';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { AlertCircle, Clock, MapPin, User, RefreshCw, ChevronLeft } from 'lucide-react';

export default function AppointmentQrPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [qrToken, setQrToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tokenRefreshCountdown, setTokenRefreshCountdown] = useState(0);
  const tokenRefreshIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const qrRef = useRef(null);

  // Load appointment details
  useEffect(() => {
    const loadAppointment = async () => {
      try {
        const { data } = await api.get(`/appointments/${id}`);
        setAppointment(data);
        setError(null);

        // Check if appointment is confirmed (QR only available after confirmation)
        if (data.status !== 'confirmed' && data.status !== 'queued' && data.status !== 'checked_in') {
          setError(`Appointment not yet confirmed. Current status: ${data.status}. Please wait for admin confirmation and check your email for the QR code.`);
          setLoading(false);
          return;
        }

        // Check if we're in the check-in window
        const now = new Date();
        if (data.checkInOpensAt) {
          const opensAt = new Date(data.checkInOpensAt);
          if (now < opensAt) {
            setError(`Check-in not yet available. Starts at ${opensAt.toLocaleTimeString()}`);
            setLoading(false);
            return;
          }
        }

        if (data.checkInExpiresAt) {
          const expiresAt = new Date(data.checkInExpiresAt);
          if (now > expiresAt) {
            setError(`Check-in window has expired at ${expiresAt.toLocaleTimeString()}. Please contact support.`);
            setLoading(false);
            return;
          }
        }

        setLoading(false);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load appointment');
        setLoading(false);
      }
    };

    loadAppointment();
  }, [id]);

  // Fetch initial QR token
  useEffect(() => {
    if (!appointment || appointment.status !== 'confirmed') return;

    const fetchQrToken = async () => {
      try {
        const { data } = await api.get(`/appointments/${id}/qr`);
        setQrToken(data.token);
        setTokenRefreshCountdown(data.expiresIn || 60);
        setError(null);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to generate QR code');
      }
    };

    fetchQrToken();
  }, [appointment, id]);

  // Countdown timer for token expiration
  useEffect(() => {
    if (tokenRefreshCountdown <= 0) return;

    countdownIntervalRef.current = setInterval(() => {
      setTokenRefreshCountdown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownIntervalRef.current);
  }, [tokenRefreshCountdown]);

  // Auto-refresh token every 30 seconds (before it expires at 60s)
  useEffect(() => {
    if (!appointment || appointment.status !== 'confirmed') return;

    const refreshToken = async () => {
      try {
        const { data } = await api.get(`/appointments/${id}/qr`);
        setQrToken(data.token);
        setTokenRefreshCountdown(data.expiresIn || 60);
        toast.success('QR code refreshed');
      } catch (err) {
        if (err.response?.status === 400 || err.response?.status === 409) {
          setError(err.response?.data?.message || 'QR code is no longer available');
        } else {
          console.error('Token refresh error:', err);
        }
      }
    };

    // Refresh every 30 seconds
    tokenRefreshIntervalRef.current = setInterval(refreshToken, 30000);

    return () => clearInterval(tokenRefreshIntervalRef.current);
  }, [appointment, id]);

  // Manual refresh button
  const handleManualRefresh = async () => {
    try {
      const { data } = await api.get(`/appointments/${id}/qr`);
      setQrToken(data.token);
      setTokenRefreshCountdown(data.expiresIn || 60);
      toast.success('QR code refreshed');
      setError(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to refresh QR code';
      setError(msg);
      toast.error(msg);
    }
  };

  // Download QR code
  const handleDownloadQr = () => {
    if (!qrRef.current) return;
    const url = qrRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `appointment-${appointment?.tokenLabel || id}-qr.png`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-teal-600" />
          <p className="mt-4 text-slate-600">Loading appointment...</p>
        </div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Toaster position="top-right" />
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
          <div className="flex gap-3">
            <AlertCircle className="h-6 w-6 flex-shrink-0 text-red-600" />
            <div>
              <h2 className="font-semibold text-red-900">Cannot Display QR Code</h2>
              <p className="mt-1 text-sm text-red-800">{error}</p>
              <button
                onClick={() => navigate(-1)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                <ChevronLeft size={16} /> Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const appointmentTime = new Date(appointment.startTime);
  const isLateInWindow = tokenRefreshCountdown < 15;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 p-4">
      <Toaster position="top-right" />
      <div className="w-full max-w-md">
        {/* Header */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100"
        >
          <ChevronLeft size={16} /> Back
        </button>

        {/* Main Card */}
        <div className="space-y-6 rounded-2xl bg-white p-6 shadow-2xl">
          {/* Appointment Info */}
          <div className="space-y-3 border-b border-slate-200 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Appointment</p>
                <p className="text-2xl font-bold text-slate-900">{appointment.tokenLabel}</p>
              </div>
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                {appointment.status}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <User size={16} className="text-slate-400" />
                {appointment.serviceCode}
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Clock size={16} className="text-slate-400" />
                {appointmentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              {appointment.location && (
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin size={16} className="text-slate-400" />
                  {typeof appointment.location === 'string' ? appointment.location : appointment.location.name}
                </div>
              )}
            </div>
          </div>

          {/* QR Code */}
          <div className="space-y-4">
            <p className="text-center text-sm font-medium text-slate-600">
              Present this QR code at check-in
            </p>

            {qrToken ? (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-lg border-2 border-slate-200 bg-white p-4">
                  <QRCode
                    ref={qrRef}
                    value={qrToken}
                    size={280}
                    level="H"
                    includeMargin={true}
                    renderAs="canvas"
                  />
                </div>

                {/* Countdown & Code */}
                <div className="w-full space-y-3 rounded-lg bg-teal-50 p-4">
                  <div className="flex items-center justify-center gap-2">
                    <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                      tokenRefreshCountdown < 15
                        ? 'bg-red-100 text-red-700'
                        : 'bg-teal-100 text-teal-700'
                    }`}>
                      <Clock size={14} />
                      Valid for: <span className="font-bold">{tokenRefreshCountdown}s</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-600 mb-1">8-Digit Code (if QR can't scan):</p>
                    <p className="text-3xl font-bold font-mono text-teal-700 tracking-widest">{qrToken}</p>
                  </div>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={handleManualRefresh}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-teal-600 px-4 py-3 font-medium text-white hover:bg-teal-700 transition"
                >
                  <RefreshCw size={16} /> Refresh QR Code
                </button>

                {/* Download Button */}
                <button
                  onClick={handleDownloadQr}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Download QR Code
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-slate-500">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-teal-600" />
                <p className="text-sm">Generating QR code...</p>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              <strong>📱 Keep this page private:</strong> Screenshots and forwards don't work. Only the live rotating QR code on this page can be scanned at check-in.
            </p>
          </div>

          {/* Instructions */}
          <div className="space-y-2 text-sm text-slate-600">
            <p className="font-medium text-slate-700">How to check in:</p>
            <ol className="list-inside list-decimal space-y-1 text-xs">
              <li>Show this QR code at the location</li>
              <li>Staff will scan it with the admin scanner</li>
              <li>You'll receive your queue number</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-slate-500">
          QR codes refresh every 30 seconds • Valid until {new Date(appointment.checkInExpiresAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

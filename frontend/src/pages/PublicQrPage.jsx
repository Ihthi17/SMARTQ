import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import api from '../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { Clock, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * PUBLIC QR Code Page - No authentication required
 * Accessible via: /qr/{appointmentId}/{token}
 * Shows live, auto-refreshing QR code for check-in
 */
export default function PublicQrPage() {
  const { id: appointmentId, token } = useParams();
  const navigate = useNavigate();
  const qrCanvasRef = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [checkInCode, setCheckInCode] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Load appointment and initial QR code
  useEffect(() => {
    const loadAppointmentAndQr = async () => {
      try {
        // Fetch current QR code (public endpoint with token) - this is the main request
        const { data: qrData } = await api.get(`/appointments/${appointmentId}/qr/${token}`);
        
        // Generate QR image from code
        const qrDataUrl = await QRCode.toDataURL(qrData.code, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          quality: 0.95,
          margin: 1,
          width: 300
        });
        
        // Set appointment info from QR response
        setAppointment({
          tokenLabel: qrData.tokenLabel || 'Loading...',
          serviceCode: qrData.service || 'Loading...',
          branchCode: qrData.location || 'Loading...',
          status: 'confirmed'
        });
        
        setQrDataUrl(qrDataUrl);
        setCheckInCode(qrData.code);
        setSecondsRemaining(qrData.secondsRemaining || 60);
        setError(null);
        setLoading(false);
      } catch (err) {
        console.error('QR Load Error:', err);
        setError(err.response?.data?.message || 'Failed to load QR code. Invalid or expired link.');
        setLoading(false);
      }
    };

    loadAppointmentAndQr();
  }, [appointmentId, token]);

  // Countdown timer
  useEffect(() => {
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          return 0; // Trigger refresh
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  // Auto-refresh QR code every 30 seconds or when it expires
  useEffect(() => {
    if (!appointmentId || !token) return;

    const refreshQr = async () => {
      try {
        const { data } = await api.get(`/appointments/${appointmentId}/qr/${token}`);
        
        // Generate QR image from code
        const qrDataUrl = await QRCode.toDataURL(data.code, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          quality: 0.95,
          margin: 1,
          width: 300
        });
        
        setQrDataUrl(qrDataUrl);
        setCheckInCode(data.code);
        setSecondsRemaining(data.secondsRemaining || 60);
      } catch (err) {
        console.error('Failed to refresh QR:', err);
      }
    };

    // Refresh every 30 seconds
    const interval = setInterval(refreshQr, 30000);

    return () => clearInterval(interval);
  }, [appointmentId, token]);

  // Manual refresh button
  const handleManualRefresh = async () => {
    try {
      const { data } = await api.get(`/appointments/${appointmentId}/qr/${token}`);
      
      // Generate QR image from code
      const qrDataUrl = await QRCode.toDataURL(data.code, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.95,
        margin: 1,
        width: 300
      });
      
      setQrDataUrl(qrDataUrl);
      setCheckInCode(data.code);
      setSecondsRemaining(data.secondsRemaining || 60);
      toast.success('QR code refreshed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to refresh QR code');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
        <Toaster position="top-right" />
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 mb-4"></div>
          <p className="text-slate-600">Loading QR code...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-slate-100 p-4">
        <Toaster position="top-right" />
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <div className="flex gap-3">
              <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
              <div>
                <h2 className="font-semibold text-red-900">QR Code Not Available</h2>
                <p className="text-sm text-red-800 mt-1">{error}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full rounded-lg bg-teal-600 px-4 py-2 text-white font-medium hover:bg-teal-700"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isLateInWindow = secondsRemaining < 15;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Toaster position="top-right" />

      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="text-center mb-6 pt-4">
          <h1 className="text-2xl font-bold text-slate-900">Check-in QR Code</h1>
          <p className="text-sm text-slate-600 mt-1">Scan at the counter for instant check-in</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
          {/* Appointment Info */}
          <div className="space-y-3 border-b border-slate-200 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Token</p>
                <p className="text-2xl font-bold text-slate-900">{appointment?.tokenLabel || 'Loading...'}</p>
              </div>
              <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                {appointment?.status || 'confirmed'}
              </span>
            </div>

            <div className="text-sm text-slate-600 space-y-1">
              {appointment?.serviceCode && (
                <p>📋 Service: <span className="font-medium">{appointment.serviceCode}</span></p>
              )}
              {appointment?.branchCode && (
                <p>📍 Location: <span className="font-medium">{appointment.branchCode}</span></p>
              )}
            </div>
          </div>

          {/* QR Code Section */}
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700 mb-3">Show this QR code</p>
              
              {qrDataUrl ? (
                <div className="flex justify-center">
                  <div className="rounded-xl border-2 border-slate-200 bg-white p-4">
                    <img 
                      src={qrDataUrl}
                      alt="Check-in QR Code"
                      className="h-80 w-80"
                    />
                  </div>
                </div>
              ) : (
                <div className="h-80 w-80 bg-slate-100 rounded-lg animate-pulse mx-auto"></div>
              )}
            </div>

            {/* Countdown & Code Display */}
            <div className="bg-teal-50 rounded-lg p-4 space-y-3">
              {/* Countdown */}
              <div className="flex items-center justify-center gap-2">
                <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  isLateInWindow
                    ? 'bg-red-100 text-red-700'
                    : 'bg-teal-100 text-teal-700'
                }`}>
                  <Clock size={14} />
                  Valid for: <span className="font-bold">{secondsRemaining}s</span>
                </div>
              </div>

              {/* 8-Digit Code */}
              <div className="text-center">
                <p className="text-xs text-slate-600 mb-2">Or enter this code manually:</p>
                <p className="text-4xl font-bold font-mono text-teal-700 tracking-widest">
                  {checkInCode || '--------'}
                </p>
                <p className="text-xs text-slate-600 mt-2">Show to staff if QR scan fails</p>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleManualRefresh}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 font-medium text-white hover:bg-teal-700 transition"
            >
              <RefreshCw size={16} /> Refresh Code
            </button>
          </div>

          {/* Instructions */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-800">
              <strong>ℹ️ Instructions:</strong> Keep this page open on your phone. Staff will scan the QR code or ask for the 8-digit code. The code auto-refreshes every 60 seconds for security.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-4">
          Smart Queue • Check-in System
        </p>
      </div>
    </div>
  );
}

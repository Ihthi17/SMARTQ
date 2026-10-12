import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { QrCode, AlertCircle, CheckCircle, Clock, User, MapPin, Phone, Copy, X, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ScannerPage() {
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const [scanning, setScanning] = useState(true);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [checkedInQueueNumber, setCheckedInQueueNumber] = useState(null);
  const scannerInstanceRef = useRef(null);

  // Initialize QR code scanner
  useEffect(() => {
    if (!scanning || !scannerRef.current) return;

    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
    }, false);

    scannerInstanceRef.current = scanner;

    const handleSuccess = async (decodedText) => {
      // Stop scanner immediately to prevent duplicate scans
      if (scanner) {
        scanner.pause();
      }
      setScanning(false);

      // Scan the QR token
      await handleScan(decodedText);
    };

    const handleError = (error) => {
      // Ignore errors during scanning
      console.debug('QR scan error:', error);
    };

    scanner.render(handleSuccess, handleError);

    return () => {
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.clear().catch(() => {});
      }
    };
  }, [scanning]);

  const handleScan = async (token) => {
    setLoading(true);
    try {
      const { data } = await api.post('/admin/scan', { token });
      setPreview(data);
      toast.success('Appointment found');
    } catch (error) {
      setScanning(true);
      const msg = error.response?.data?.message || 'Invalid or expired QR code';
      toast.error(msg);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!preview) return;

    setLoading(true);
    try {
      const { data } = await api.post(`/admin/checkin/${preview.appointmentId}`, {});
      toast.success(`Check-in successful! Queue #${data.appointment.queueNumber}`);
      setCheckedInQueueNumber(data.appointment.queueNumber);
      setPreview(null);

      // Auto-reset after 3 seconds
      setTimeout(() => {
        setCheckedInQueueNumber(null);
        setScanning(true);
      }, 3000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleManualScan = async () => {
    if (!manualToken.trim()) {
      toast.error('Enter a QR token');
      return;
    }

    setManualToken('');
    await handleScan(manualToken.trim());
  };

  const handleReject = () => {
    setPreview(null);
    setScanning(true);
  };

  // Success animation
  if (checkedInQueueNumber) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <CheckCircle className="h-16 w-16 animate-bounce text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-emerald-900">Check-in Successful!</h2>
          <p className="mt-2 text-4xl font-bold text-emerald-700">#{checkedInQueueNumber}</p>
          <p className="mt-1 text-sm text-emerald-600">Queue number assigned</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <QrCode className="h-6 w-6 text-teal-400" />
            <h1 className="text-xl font-bold text-white">QR Code Scanner</h1>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {/* Scanner or Preview */}
        {!preview ? (
          <div className="space-y-4">
            {scanning && (
              <div className="overflow-hidden rounded-xl bg-black shadow-2xl">
                <div id="qr-reader" className="w-full" style={{ minHeight: '400px' }} />
              </div>
            )}

            {!scanning && !preview && (
              <div className="rounded-xl bg-slate-800 p-8 text-center text-slate-400">
                <QrCode className="mx-auto mb-4 h-12 w-12" />
                <p>Ready to scan. Point camera at QR code.</p>
              </div>
            )}

            {/* Manual Token Entry */}
            <div className="rounded-xl bg-slate-800 p-4 shadow-lg">
              <p className="mb-3 text-sm font-medium text-slate-300">Fallback: Paste token manually</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste QR token here..."
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                  onKeyPress={(e) => e.key === 'Enter' && handleManualScan()}
                />
                <button
                  onClick={handleManualScan}
                  disabled={!manualToken.trim() || loading}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  Scan
                </button>
              </div>
            </div>

            {/* Resume Scan Button */}
            {!scanning && (
              <button
                onClick={() => setScanning(true)}
                className="w-full rounded-lg bg-slate-700 py-3 font-medium text-white hover:bg-slate-600"
              >
                Resume Camera
              </button>
            )}
          </div>
        ) : (
          /* Preview Card */
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-6 shadow-2xl">
              {/* Customer Info */}
              <div className="space-y-3 border-b border-slate-200 pb-4">
                <h2 className="text-2xl font-bold text-slate-900">{preview.customerName}</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone size={16} className="text-slate-400" />
                    Last 4: {preview.phoneLastFour}
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <User size={16} className="text-slate-400" />
                    {preview.service}
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <MapPin size={16} className="text-slate-400" />
                    {typeof preview.location === 'string' ? preview.location : preview.location?.name}
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Clock size={16} className="text-slate-400" />
                    {new Date(preview.startTime).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Photo if available */}
              {preview.photoUrl && (
                <div className="my-4 flex justify-center">
                  <img
                    src={preview.photoUrl}
                    alt={preview.customerName}
                    className="h-24 w-24 rounded-full border-4 border-teal-200 object-cover"
                  />
                </div>
              )}

              {/* Status Badge */}
              <div className="mt-4 rounded-lg bg-emerald-50 p-3">
                <p className="text-center text-sm font-medium text-emerald-700">
                  Status: <span className="font-bold">{preview.status}</span>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCheckIn}
                disabled={loading}
                className="flex-1 rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Confirm Check-in'}
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 rounded-lg border-2 border-slate-300 bg-white py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 rounded-xl bg-slate-800 p-4 text-slate-300">
          <p className="mb-2 text-sm font-medium">Instructions:</p>
          <ol className="list-inside list-decimal space-y-1 text-xs">
            <li>Point camera at customer's QR code</li>
            <li>Review customer details in preview</li>
            <li>Click "Confirm Check-in" to assign queue number</li>
            <li>Or use manual fallback if camera unavailable</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

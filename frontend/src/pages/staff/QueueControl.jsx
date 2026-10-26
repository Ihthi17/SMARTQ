import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import { useQueueSocket } from '../../hooks/useQueueSocket';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { Check, CirclePause, CirclePlay, ListOrdered, SkipForward, Siren, X, QrCode, Clock, RefreshCw, Palette } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { servicesForChannel } from '../../utils/serviceCatalog';
import NotificationCenter from '../../components/notifications/NotificationCenter';
import { WaitingCustomersList } from '../../components/queue/WaitingCustomersList';
import { QueueColorPicker } from '../../components/queue/QueueColorPicker';
import { TokenColorPickerModal } from '../../components/queue/TokenColorPickerModal';
import { EnhancedQueueDisplay } from '../../components/queue/EnhancedQueueDisplay';

export default function QueueControl() {
  const { user, permissions } = useContext(AuthContext);
  const canManageQueue = user?.role === 'SUPER_ADMIN' || permissions.includes('queue.manage');
  const canManageAppointments = user?.role === 'SUPER_ADMIN' || permissions.includes('appointments.manage');
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [initialQueue, setInitialQueue] = useState(null);
  const [queueColors, setQueueColors] = useState({ current: '#0f766e', next: '#7c3aed', accent: '#0d9488' });
  const [priorityColors, setPriorityColors] = useState({ standard: '#64748b', vip: '#f59e0b', emergency: '#ef4444' });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPriorityColorPicker, setShowPriorityColorPicker] = useState(false);
  const [colorPickerBusy, setColorPickerBusy] = useState(false);
  const [showColorPickerModal, setShowColorPickerModal] = useState(false);
  const [selectedAppointmentForColor, setSelectedAppointmentForColor] = useState(null);
  const [busy, setBusy] = useState('');
  const [queueStats, setQueueStats] = useState({ startTime: null, currentStartTime: null, elapsed: 0, serviceElapsed: 0 });
  const [scanQRMode, setScanQRMode] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [manualCheckInMode, setManualCheckInMode] = useState(false);
  const [selectedForCheckIn, setSelectedForCheckIn] = useState(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('all'); // Filter for priority
  
  const provider = providers.find(item => item._id === providerId);
  const branchCode = provider?.branch?.code || provider?.code || '';
  const services = useMemo(() => servicesForChannel(provider, 'queue'), [provider]);
  const queueDate = new Date().toISOString().split('T')[0]; // Pass today's date to ensure consistency
  const { queue, connected } = useQueueSocket(providerId, branchCode, serviceCode, queueDate, initialQueue);

  // Load providers and colors
  useEffect(() => {
    api.get('/providers', { params: { _t: Date.now() } })
      .then(({ data }) => {
        // Filter to only active providers
        const activeProviders = data.filter(p => p.isActive !== false);
        setProviders(activeProviders);
        if (activeProviders.length) {
          setProviderId(activeProviders[0]._id);
          setServiceCode(servicesForChannel(activeProviders[0], 'queue')[0] || '');
        }
      })
      .catch(error => toast.error(error.response?.data?.message || 'Could not load locations'));
    
    api.get('/settings/branding', { params: { includeLogo: false } })
      .then(({ data }) => { 
        if (data.queueColors) setQueueColors(data.queueColors);
        if (data.priorityColors) setPriorityColors(data.priorityColors);
      })
      .catch(error => console.error('Could not load queue display colors:', error));
  }, []);

  const loadQueue = useCallback(async () => {
    if (!providerId) return;
    try {
      const queueDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const { data } = await api.get('/queue', { params: { providerId, branchCode, serviceCode, date: queueDate } });
      setInitialQueue(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load the queue');
    }
  }, [providerId, branchCode, serviceCode]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const mutateQueue = async (action, path, body = {}) => {
    setBusy(action);
    try {
      // Always pass today's date to ensure consistent queue date
      const queueDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const response = await api.post(path, { ...body, branchCode, serviceCode, date: queueDate });
      if (response.data.message) toast.success(response.data.message);
      
      if (action === 'start') {
        setQueueStats(prev => ({ ...prev, startTime: Date.now(), elapsed: 0 }));
        toast.success('Queue started - timing tracking active');
      } else if (action === 'serving') {
        setQueueStats(prev => ({ ...prev, currentStartTime: Date.now(), serviceElapsed: 0 }));
        toast.success('Service started - customer service timer active');
      } else if (action === 'complete') {
        if (queueStats.serviceElapsed) {
          toast.success(`Service completed - duration: ${formatTime(queueStats.serviceElapsed)}`);
        }
        setQueueStats(prev => ({ ...prev, currentStartTime: null, serviceElapsed: 0 }));
      } else if (action === 'pause') {
        setQueueStats(prev => ({ ...prev, startTime: null, elapsed: 0 }));
      }
      
      await loadQueue();
      return response.data;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Queue operation failed');
      return null;
    } finally { setBusy(''); }
  };

  const handleSaveColors = async (newColors) => {
    setColorPickerBusy(true);
    try {
      await api.patch('/settings', {
        updates: [
          { key: 'queue_color_current', value: newColors.current },
          { key: 'queue_color_next', value: newColors.next },
          { key: 'queue_color_accent', value: newColors.accent },
        ],
      });
      setQueueColors(newColors);
      toast.success('Queue colors updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save colors');
    } finally {
      setColorPickerBusy(false);
    }
  };

  const handleSavePriorityColors = async (newColors) => {
    setColorPickerBusy(true);
    try {
      await api.patch('/settings', {
        updates: [
          { key: 'priority_color_standard', value: newColors.standard },
          { key: 'priority_color_vip', value: newColors.vip },
          { key: 'priority_color_emergency', value: newColors.emergency },
        ],
      });
      setPriorityColors(newColors);
      setShowPriorityColorPicker(false);
      toast.success('Priority colors updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save priority colors');
    } finally {
      setColorPickerBusy(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const handleQRScan = async (qrToken) => {
    try {
      // If it's an 8-digit code, use the 8-digit endpoint
      if (/^\d{8}$/.test(qrToken.trim())) {
        const { data } = await api.post('/appointments/checkin-by-code', { code: qrToken.trim() });
        toast.success('Customer checked in successfully');
      } else {
        // Otherwise try JWT token endpoint
        const { data } = await api.post(`/appointments/scan`, { token: qrToken, branchCode, serviceCode });
        toast.success('Customer checked in successfully');
      }
      setScanQRMode(false);
      setQrInput('');
      await loadQueue();
    } catch (error) {
      toast.error(error.response?.data?.message || 'QR check-in failed');
      setQrInput('');
    }
  };

  const manualCheckIn = async (appointmentId) => {
    setCheckInBusy(true);
    try {
      const { data } = await api.post(`/appointments/${appointmentId}/staff-check-in`, { 
        token: selectedForCheckIn?.qrToken 
      });
      toast.success(data.message || 'Customer checked in successfully');
      setManualCheckInMode(false);
      setSelectedForCheckIn(null);
      await loadQueue();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Check-in failed');
    } finally {
      setCheckInBusy(false);
    }
  };

  useEffect(() => {
    if (scanQRMode && qrInput.length >= 6) {
      handleQRScan(qrInput);
    }
  }, [qrInput, scanQRMode]);

  // Timer for elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      if (queueStats.startTime) {
        setQueueStats(prev => ({
          ...prev,
          elapsed: Math.round((Date.now() - prev.startTime) / 1000)
        }));
      }
      if (queueStats.currentStartTime) {
        setQueueStats(prev => ({
          ...prev,
          serviceElapsed: Math.round((Date.now() - prev.currentStartTime) / 1000)
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [queueStats.startTime, queueStats.currentStartTime]);

  const changePriority = async (appointmentId, priority) => {
    try {
      console.log('Changing priority for appointment:', appointmentId, 'to:', priority);
      const { data } = await api.patch(`/appointments/${appointmentId}/priority`, { priority });
      console.log('Priority change response:', data);
      toast.success(priority === 'emergency' ? '⚡ Emergency priority set' : priority === 'high' ? '👑 VIP priority set' : 'Standard priority set');
      await loadQueue();
    } catch (error) {
      console.error('Priority change error:', error);
      toast.error(error.response?.data?.message || 'Could not update priority');
    }
  };

  const changeTokenColor = async (appointmentId, color) => {
    try {
      await api.patch(`/appointments/${appointmentId}/token-color`, { color });
      toast.success('Token color updated');
      await loadQueue();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update token color');
    }
  };

  const cancelToken = async (appointmentId) => {
    try {
      await api.post(`/appointments/${appointmentId}/cancel`, { reason: 'Cancelled by staff' });
      toast.success('Queue entry cancelled');
      await loadQueue();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not cancel queue entry');
    }
  };

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 p-6 text-white shadow-md">
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <ListOrdered size={32} /> Queue Control Console
          </h1>
          <p className="mt-2 text-teal-100">Manage real-time customer check-ins, service progression, and token states.</p>
        </div>

        {/* Service Selection */}
        <div className="grid gap-3 rounded-xl bg-white p-6 shadow-sm sm:grid-cols-3">
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-900">Location</span>
            <select 
              value={providerId} 
              onChange={event => {
                const selected = providers.find(item => item._id === event.target.value);
                setProviderId(event.target.value);
                setServiceCode(servicesForChannel(selected, 'queue')[0] || '');
                setInitialQueue(null);
              }} 
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              {providers.length === 0 && <option value="">No locations configured</option>}
              {providers.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-900">Service Counter</span>
            <select 
              value={serviceCode} 
              onChange={event => setServiceCode(event.target.value)} 
              disabled={!provider} 
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-900 disabled:bg-slate-50 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              {services.map(service => <option key={service} value={service}>{service}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-slate-900">Status</span>
            <div className="flex items-center gap-3 rounded-lg border border-slate-300 px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100">
              <span className={`h-3 w-3 rounded-full ${queue?.status === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="font-semibold text-slate-900">
                {queue?.status === 'open' ? '🟢 Live' : '🔴 Closed'}
              </span>
              {!connected && <span className="ml-auto text-xs font-medium text-amber-600">⚠ Syncing...</span>}
            </div>
          </label>
        </div>

        {/* Queue Controls */}
        {providerId && queue && (
          <div className="space-y-3 rounded-xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-semibold text-slate-900">Queue Operations</h3>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">Priority:</label>
                <select 
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
                >
                  <option value="all">All Priorities</option>
                  <option value="emergency">⚡ Emergency</option>
                  <option value="high">👑 High/VIP</option>
                  <option value="normal">Standard</option>
                </select>
              </div>
              <button
                onClick={loadQueue}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw size={16} /> Refresh
              </button>
              <button
                onClick={() => setShowPriorityColorPicker(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Configure priority colors"
              >
                <div className="flex gap-1">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: priorityColors.standard }}></div>
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: priorityColors.vip }}></div>
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: priorityColors.emergency }}></div>
                </div>
                Colors
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {queue.status !== 'open' && (
                <button
                  onClick={() => mutateQueue('start', `/queue/${providerId}/start`)}
                  disabled={busy === 'start'}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  <CirclePlay size={18} /> {busy === 'start' ? 'Starting...' : 'Start Queue'}
                </button>
              )}
              {queue.status === 'open' && (
                <>
                  <button
                    onClick={() => mutateQueue('next', `/queue/${providerId}/next`)}
                    disabled={busy === 'next' || !canManageQueue}
                    className="flex items-center gap-2 rounded-lg border-2 border-purple-300 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-900 hover:bg-purple-100 disabled:opacity-50 transition-colors"
                  >
                    <SkipForward size={18} /> Next Token
                  </button>
                  <button
                    onClick={() => mutateQueue('serving', `/queue/${providerId}/current/start`)}
                    disabled={busy === 'serving' || !canManageQueue}
                    className="flex items-center gap-2 rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                  >
                    <CirclePlay size={18} /> Start Service
                  </button>
                  <button
                    onClick={() => mutateQueue('complete', `/queue/${providerId}/current/complete`)}
                    disabled={busy === 'complete' || !canManageQueue}
                    className="flex items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                  >
                    <Check size={18} /> Complete & Next
                  </button>
                  <button
                    onClick={() => mutateQueue('pause', `/queue/${providerId}/pause`)}
                    disabled={busy === 'pause' || !canManageQueue}
                    className="flex items-center gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                  >
                    <CirclePause size={18} /> Pause Queue
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to stop and reset the queue?')) {
                        mutateQueue('stop', `/queue/${providerId}/stop`);
                      }
                    }}
                    disabled={busy === 'stop' || !canManageQueue}
                    className="flex items-center gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <X size={18} /> Stop Queue
                  </button>
                </>
              )}
              <button
                onClick={() => setScanQRMode(!scanQRMode)}
                className="flex items-center gap-2 rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 hover:bg-blue-100 transition-colors ml-auto"
              >
                <QrCode size={18} /> {scanQRMode ? 'Close QR' : 'Scan QR'}
              </button>
            </div>
          </div>
        )}

        {/* QR Input */}
        {scanQRMode && (
          <div className="rounded-lg border-2 border-blue-400 bg-gradient-to-r from-blue-50 to-blue-100 p-6 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-blue-900">🔍 QR Scanner Active</p>
            <p className="mb-3 text-sm text-blue-800">Point camera at QR code or paste token:</p>
            <input
              autoFocus
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="QR token will auto-detect..."
              className="w-full rounded-lg border-2 border-blue-300 bg-white px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-2 text-xs text-blue-700">Press Enter or scan to check in automatically</p>
          </div>
        )}

        {/* Queue Status Display */}
        {queue && (
          <div className="grid gap-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            {/* Now Serving */}
            <div className="rounded-lg border-2 border-teal-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Now Serving</p>
              {queue.current ? (
                <>
                  <p className="mt-3 text-3xl font-bold text-teal-900">{queue.current.tokenLabel}</p>
                  <p className="mt-2 text-sm text-teal-700">Name: {queue.current.customerName || 'Customer'} (Counter 1)</p>
                  {queueStats.serviceElapsed > 0 && (
                    <p className="mt-2 text-xs text-teal-600">⏱️ Service: {formatTime(queueStats.serviceElapsed)}</p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-2xl text-slate-400">—</p>
              )}
            </div>

            {/* Confirmed Queue (Not Yet Checked-In) */}
            <div className="rounded-lg border-2 border-amber-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Confirmed Queue</p>
              <p className="mt-3 text-3xl font-bold text-amber-900">{queue.confirmedCount || 0}</p>
              <p className="mt-2 text-sm text-amber-700">Not Yet Checked-In</p>
            </div>

            {/* Waiting Queue (Checked-In) */}
            <div className="rounded-lg border-2 border-blue-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Waiting Queue</p>
              <p className="mt-3 text-3xl font-bold text-blue-900">{queue.waitingCount || 0}</p>
              <p className="mt-2 text-sm text-blue-700">Checked-In & Waiting</p>
            </div>

            {/* Next Token */}
            <div className="rounded-lg border-2 border-purple-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-purple-600">Next Token</p>
              {queue.next ? (
                <>
                  <p className="mt-3 text-3xl font-bold text-purple-900">{queue.next.tokenLabel}</p>
                  <p className="mt-2 text-sm text-purple-700">Priority: {queue.next.priority === 'emergency' ? '⚡ Emergency' : queue.next.priority === 'vip' ? '👑 VIP' : 'Standard'}</p>
                </>
              ) : (
                <p className="mt-3 text-2xl text-slate-400">—</p>
              )}
            </div>
          </div>
        )}

        {/* Confirmed Appointments (Not Yet Checked In) */}
        {queue && queue.confirmed && queue.confirmed.length > 0 && (
          <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm border-l-4 border-amber-500">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirmed Appointments</h3>
                <p className="mt-0.5 text-xs text-slate-500">Not yet checked in</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {queue.confirmed.length}
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {queue.confirmed.slice(0, 20).map((entry) => {
                const isCheckedIn = entry.status === 'queued' || entry.status === 'called' || entry.status === 'in_service';
                return (
                  <div 
                    key={entry._id}
                    className={`relative p-2.5 rounded-lg border text-white transition-all text-center ${
                      isCheckedIn ? 'ring-2 ring-green-400 brightness-125 border-transparent' : 'opacity-60 border-slate-200'
                    }`}
                    style={{ 
                      backgroundColor: entry.tokenColor || '#64748b'
                    }}
                  >
                    {/* Blur overlay for unchecked-in tokens */}
                    {!isCheckedIn && (
                      <div className="absolute inset-0 rounded-lg bg-white/10 backdrop-blur-sm pointer-events-none"></div>
                    )}
                    
                    {/* Content */}
                    <div className="relative z-10 space-y-0.5">
                      <p className="text-base font-bold leading-tight">{entry.tokenLabel}</p>
                      {isCheckedIn && <p className="text-xs font-bold">✓</p>}
                      <p className="text-xs truncate leading-tight opacity-90">{entry.customerName || 'Customer'}</p>
                      <p className="text-xs truncate leading-tight opacity-75">{entry.serviceCode}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {queue.confirmed.length > 20 && (
              <p className="text-center text-xs text-slate-500">
                Showing 20 of {queue.confirmed.length}
              </p>
            )}
          </div>
        )}

        {/* Active Waiting List */}
        {queue && queue.waiting && queue.waiting.length > 0 && (
          <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Active Waiting List</h3>
                <p className="mt-1 text-xs text-slate-500">Updated just now</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: priorityColors.standard }}></div>
                  <span>Standard</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: priorityColors.vip }}></div>
                  <span>VIP</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: priorityColors.emergency }}></div>
                  <span>Emergency</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800">
                  {priorityFilter === 'all' ? queue.waiting.length : queue.waiting.filter(c => 
                    priorityFilter === 'emergency' ? c.priority === 'emergency' :
                    priorityFilter === 'high' ? c.priority === 'high' :
                    c.priority === 'normal'
                  ).length} in queue
                </span>
              </div>
            </div>
            
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Token No</th>
                    <th className="px-4 py-3 font-semibold">Customer / Patient</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Wait Time</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queue.waiting
                    .filter(entry => 
                      priorityFilter === 'all' ? true :
                      priorityFilter === 'emergency' ? entry.priority === 'emergency' :
                      priorityFilter === 'high' ? entry.priority === 'high' :
                      entry.priority === 'normal'
                    )
                    .slice(0, 15)
                    .map((entry, index) => (
                    <tr key={entry._id} className="hover:bg-slate-50 transition-colors relative group">
                      <td className="px-4 py-3">
                        <span 
                          className={`font-bold px-3 py-1 rounded text-white inline-block transition-all ${
                            entry.status === 'queued' || entry.status === 'called' || entry.status === 'in_service' 
                              ? 'ring-2 ring-green-400 brightness-110' 
                              : ''
                          }`}
                          style={{ backgroundColor: entry.tokenColor || '#0f766e' }}
                          title={entry.status === 'queued' ? '✓ Checked In' : 'Not Checked In'}
                        >
                          {entry.tokenLabel}
                          {(entry.status === 'queued' || entry.status === 'called' || entry.status === 'in_service') && '  ✓'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{entry.customerName || 'Anonymous'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          entry.priority === 'emergency' ? 'bg-red-100 text-red-800' :
                          entry.priority === 'high' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {entry.priority === 'emergency' ? '⚡ Emergency' : 
                           entry.priority === 'high' ? '👑 VIP' : 
                           'Standard'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {entry.estimatedWaitMinutes || 0} mins
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800`}>
                          ✓ Waiting
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={entry.priority || 'normal'}
                          onChange={(e) => {
                            console.log('Priority dropdown changed to:', e.target.value);
                            changePriority(entry._id, e.target.value);
                          }}
                          className="rounded px-2 py-1 text-xs border border-slate-300 bg-white font-medium"
                          title="Set priority"
                        >
                          <option value="normal">Standard</option>
                          <option value="high">👑 VIP</option>
                          <option value="emergency">⚡ Emergency</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {queue.waiting.filter(entry => 
              priorityFilter === 'all' ? true :
              priorityFilter === 'emergency' ? entry.priority === 'emergency' :
              priorityFilter === 'high' ? entry.priority === 'high' :
              entry.priority === 'normal'
            ).length > 15 && (
              <p className="text-center text-xs text-slate-500">
                Showing 15 of {queue.waiting.filter(entry => 
                  priorityFilter === 'all' ? true :
                  priorityFilter === 'emergency' ? entry.priority === 'emergency' :
                  priorityFilter === 'high' ? entry.priority === 'high' :
                  entry.priority === 'normal'
                ).length} waiting customers
              </p>
            )}
          </div>
        )}

        {/* Empty Queue Message */}
        {queue && (!queue.waiting || queue.waiting.length === 0) && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-slate-600">No customers currently waiting in queue</p>
          </div>
        )}

        {/* Manual Check-in Modal */}
        {manualCheckInMode && selectedForCheckIn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setManualCheckInMode(false); }}>
            <section className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Manual Check-in Confirmation</h2>
              <div className="space-y-3 mb-6">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Queue Number</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{selectedForCheckIn.tokenLabel}</p>
                </div>
                
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Customer</p>
                  <p className="mt-2 font-semibold text-slate-900">{selectedForCheckIn.customerName || 'Unknown'}</p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Service</p>
                  <p className="mt-2 font-semibold text-slate-900">{selectedForCheckIn.serviceCode}</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 mb-6">Confirm check-in for this customer. They will be moved to the queue.</p>

              <div className="flex gap-2">
                <button
                  onClick={() => setManualCheckInMode(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => manualCheckIn(selectedForCheckIn._id)}
                  disabled={checkInBusy}
                  className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {checkInBusy ? 'Checking in...' : 'Confirm Check-in'}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Priority Color Picker Modal */}
        {showPriorityColorPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowPriorityColorPicker(false); }}>
            <section className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">Priority Token Colors</h2>
              
              <div className="space-y-4 mb-6">
                {/* Standard Color */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Standard Priority</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={priorityColors.standard}
                      onChange={(e) => setPriorityColors({ ...priorityColors, standard: e.target.value })}
                      className="h-10 w-16 rounded border border-slate-300 cursor-pointer"
                    />
                    <span className="text-sm text-slate-600">{priorityColors.standard}</span>
                  </div>
                </div>

                {/* VIP Color */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">👑 VIP Priority</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={priorityColors.vip}
                      onChange={(e) => setPriorityColors({ ...priorityColors, vip: e.target.value })}
                      className="h-10 w-16 rounded border border-slate-300 cursor-pointer"
                    />
                    <span className="text-sm text-slate-600">{priorityColors.vip}</span>
                  </div>
                </div>

                {/* Emergency Color */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">⚡ Emergency Priority</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={priorityColors.emergency}
                      onChange={(e) => setPriorityColors({ ...priorityColors, emergency: e.target.value })}
                      className="h-10 w-16 rounded border border-slate-300 cursor-pointer"
                    />
                    <span className="text-sm text-slate-600">{priorityColors.emergency}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPriorityColorPicker(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSavePriorityColors(priorityColors)}
                  disabled={colorPickerBusy}
                  className="flex-1 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {colorPickerBusy ? 'Saving...' : 'Save Colors'}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Color Picker Modal */}
        {/* <QueueColorPicker
          isOpen={showColorPicker}
          onClose={() => setShowColorPicker(false)}
          colors={queueColors}
          onSave={handleSaveColors}
          isBusy={colorPickerBusy}
        /> */}

        {/* Token Color Picker Modal */}
        <TokenColorPickerModal 
          isOpen={showColorPickerModal}
          onClose={() => {
            setShowColorPickerModal(false);
            setSelectedAppointmentForColor(null);
          }}
          appointment={selectedAppointmentForColor}
          onColorUpdated={(updated) => {
            loadQueue();
          }}
        />
      </div>
    </AdminLayout>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import api from '../api/axiosInstance';
import LiveQueueBoard from '../components/queue/LiveQueueBoard';
import { useQueueSocket } from '../hooks/useQueueSocket';
import toast, { Toaster } from 'react-hot-toast';
import { serviceLabel, servicesForChannel } from '../utils/serviceCatalog';

export default function QueueDisplayPage() {
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [initialQueue, setInitialQueue] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [queueColors, setQueueColors] = useState({ current: '#0f766e', next: '#7c3aed', accent: '#0d9488' });
  const [priorityColors, setPriorityColors] = useState({ standard: '#64748b', vip: '#f59e0b', emergency: '#ef4444' });
  const provider = providers.find(item => item._id === providerId);
  const queueServices = servicesForChannel(provider, 'queue');
  const branchCode = provider?.branch?.code || provider?.code || '';
  const { queue, connected } = useQueueSocket(providerId, branchCode, serviceCode, undefined, initialQueue);

  useEffect(() => {
    api.get('/providers', { params: { _t: Date.now() } })
      .then(({ data }) => {
        console.log('Loaded providers:', data.map(p => ({ name: p.name, isActive: p.isActive })));
        // Filter to only active providers as a safety measure
        const activeProviders = data.filter(p => p.isActive !== false);
        setProviders(activeProviders);
        if (activeProviders.length) {
          setProviderId(activeProviders[0]._id);
          setServiceCode(servicesForChannel(activeProviders[0], 'queue')[0] || '');
        }
      })
      .catch(error => toast.error(error.response?.data?.message || 'Could not load service locations'))
      .finally(() => setLoadingProviders(false));
  }, []);

  useEffect(() => {
    api.get('/settings/branding', { params: { includeLogo: false } })
      .then(({ data }) => { 
        if (data.queueColors) setQueueColors(data.queueColors);
        if (data.priorityColors) setPriorityColors(data.priorityColors);
      })
      .catch(error => console.error('Could not load queue display colors:', error));
  }, []);

  const refresh = useCallback(async () => {
    if (!providerId || !serviceCode) return;
    try {
      const { data } = await api.get('/queue', { params: { providerId, branchCode, serviceCode } });
      setInitialQueue(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load live queue');
    }
  }, [providerId, branchCode, serviceCode]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6 sm:py-6">
      <Toaster position="top-right" />
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4 px-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-300 sm:text-xs">Smart Queue · Live monitor</p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">Currently serving</h1>
            <p className="mt-1 text-xs text-slate-400">Tablet display · {providers.length} active {providers.length === 1 ? 'service location' : 'service locations'} · updates automatically</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-300' : 'text-slate-400'}`}><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />{connected ? 'Live' : 'Connecting'}</span>
            <button onClick={() => document.documentElement.requestFullscreen?.()} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"><Maximize2 size={15} /> Full screen</button>
          </div>
        </header>

        <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
            <select disabled={loadingProviders || providers.length === 0} value={providerId} onChange={event => {
              const selected = providers.find(item => item._id === event.target.value);
              setProviderId(event.target.value);
              setServiceCode(servicesForChannel(selected, 'queue')[0] || '');
              setInitialQueue(null);
            }} className="min-w-52 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60">
              {loadingProviders && <option value="">Loading service locations…</option>}
              {!loadingProviders && providers.length === 0 && <option value="">No active services configured</option>}
              {providers.map(item => <option key={item._id} value={item._id}>{item.name} ({item.code})</option>)}
            </select>
            <select disabled={!provider} value={serviceCode} onChange={event => { setServiceCode(event.target.value); setInitialQueue(null); }} className="min-w-44 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-60">
              {!queueServices.length && <option value="">No services available</option>}
              {queueServices.map(service => <option key={service} value={service}>{serviceLabel(provider, service)}</option>)}
            </select>
            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-300">
              <span><strong className="text-white">{queueServices.length}</strong> services</span>
              <span><strong className="text-white">{queue?.waitingCount ?? 0}</strong> waiting</span>
              <span><strong className="text-amber-300">{queue?.confirmed ?? 0}</strong> confirmed not checked in</span>
            </div>
        </section>

        {loadingProviders ? (
          <div className="flex min-h-28 items-center justify-center rounded-xl bg-white text-sm text-slate-500">Loading live queue…</div>
        ) : providers.length === 0 ? (
          <div className="rounded-xl bg-white px-6 py-8 text-center text-slate-700">
            <p className="font-semibold">No active service locations are configured.</p>
            <p className="mt-2 text-sm text-slate-500">Add a location and at least one service in the admin service management screen to start displaying queues.</p>
          </div>
        ) : !serviceCode ? (
          <div className="rounded-xl bg-white px-6 py-8 text-center text-slate-700">
            <p className="font-semibold">No services are configured for {provider?.name || 'this location'}.</p>
            <p className="mt-2 text-sm text-slate-500">Add a service to this location to display its live queue.</p>
          </div>
        ) : (
          <LiveQueueBoard queue={queue} connected={connected} colors={queueColors} priorityColors={priorityColors} providerName={provider?.name} serviceName={serviceCode} />
        )}
      </div>
    </main>
  );
}

import { Activity, Clock3, Users } from 'lucide-react';

const token = (entry) => entry?.tokenLabel || (entry?.tokenNumber ? `Q${entry.tokenNumber}` : '—');

export default function LiveQueueBoard({ queue, connected = false, colors = {}, priorityColors = {}, providerName = '', serviceName = '' }) {
  if (!queue) {
    return <div className="flex min-h-24 items-center justify-center rounded-xl bg-white p-8 text-center text-sm text-slate-500">Choose a service location to display its queue.</div>;
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-8">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold sm:text-2xl">{serviceName || providerName || 'Service queue'}</h2>
          <p className="mt-1 text-xs text-slate-500">{queue.branchCode || providerName || 'Service location'} · {queue.queueDate ? new Date(queue.queueDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          <Activity size={13} /> {connected ? 'Live' : 'Connecting'}
        </span>
      </header>

      <div className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-h-36 rounded-xl p-5 text-white sm:min-h-40 sm:p-6" style={{ backgroundColor: colors.current || '#0f766e' }}>
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">Now serving</p>
            <p className="mt-3 text-5xl font-extrabold tracking-tight sm:text-6xl">{token(queue.current)}</p>
            {queue.current?.serviceCode && <p className="mt-2 text-sm text-white/80">{queue.current.serviceCode}</p>}
          </div>
          <div className="min-h-36 rounded-xl p-5 text-white sm:min-h-40 sm:p-6" style={{ backgroundColor: colors.next || '#7c3aed' }}>
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">Next queue</p>
            <p className="mt-3 text-5xl font-extrabold tracking-tight sm:text-6xl">{token(queue.next)}</p>
            {queue.next?.serviceCode && <p className="mt-2 text-sm text-white/80">{queue.next.serviceCode}</p>}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: 'Total', value: queue.total ?? 0, icon: Users, border: colors.accent || '#0d9488' },
            { label: 'Waiting', value: queue.waitingCount ?? 0, icon: Clock3, border: '#2563eb' },
            { label: 'Confirmed', value: queue.confirmed ?? 0, icon: Activity, border: '#f97316' },
          ].map(({ label, value, icon: Icon, border }) => (
            <div key={label} className="rounded-lg border-t-[3px] bg-slate-50 px-2 py-3 text-center sm:py-4" style={{ borderTopColor: border }}>
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs"><Icon size={13} /> {label}</div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 min-h-24 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold">Waiting tokens</h3>
              {/* Priority color legend */}
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1 text-xs">
                  <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: priorityColors.standard || '#64748b' }}></div>
                  <span>Standard</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: priorityColors.vip || '#f59e0b' }}></div>
                  <span>VIP</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: priorityColors.emergency || '#ef4444' }}></div>
                  <span>Emergency</span>
                </div>
              </div>
            </div>
            <span className="text-xs text-slate-500">{queue.waitingCount ?? 0} waiting</span>
          </div>
          {queue.waiting?.length ? (
            <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {queue.waiting.map((entry) => {
                const bgColor = entry.priority === 'emergency' ? priorityColors.emergency : 
                               entry.priority === 'high' ? priorityColors.vip : 
                               priorityColors.standard;
                const priorityLabel = entry.priority === 'emergency' ? '⚡ Emergency' : 
                                     entry.priority === 'high' ? '👑 VIP' : 
                                     'Standard';
                return (
                  <li key={entry._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span 
                        className="font-bold px-2 py-1 rounded text-white text-sm"
                        style={{ backgroundColor: bgColor }}
                      >
                        {token(entry)}
                      </span>
                      <span className="text-xs text-slate-600">{priorityLabel}</span>
                    </div>
                    <span className="ml-3 truncate text-xs text-slate-500">{entry.serviceCode}</span>
                  </li>
                );
              })}
            </ol>
          ) : <p className="mt-3 text-xs text-slate-500">No checked-in customers waiting.</p>}
        </div>
      </div>
    </section>
  );
}

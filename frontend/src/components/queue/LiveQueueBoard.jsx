import { Activity, Clock3, Users } from 'lucide-react';

const token = (entry) => entry?.tokenLabel || (entry?.tokenNumber ? `Q${entry.tokenNumber}` : '—');

export default function LiveQueueBoard({ queue, connected = false, colors = {}, priorityColors = {}, providerName = '', serviceName = '' }) {
  if (!queue) {
    return <div className="flex min-h-24 items-center justify-center rounded-xl bg-white p-8 text-center text-sm text-slate-500">Choose a service location to display its queue.</div>;
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl flex flex-col max-h-[calc(100vh-220px)]">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-8 shrink-0">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold sm:text-2xl">{serviceName || providerName || 'Service queue'}</h2>
          <p className="mt-1 text-xs text-slate-500">{queue.branchCode || providerName || 'Service location'} · {queue.queueDate ? new Date(queue.queueDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          <Activity size={13} /> {connected ? 'Live' : 'Connecting'}
        </span>
      </header>

      <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Now Serving & Next Queue */}
        <div className="grid gap-3 md:grid-cols-2 shrink-0">
          <div 
            className={`min-h-36 rounded-xl p-5 text-white sm:min-h-40 sm:p-6 transition-all ${
              queue.current?.status === 'called' || queue.current?.status === 'in_service' 
                ? 'ring-4 ring-green-400 brightness-110' 
                : ''
            }`}
            style={{ backgroundColor: queue.current?.tokenColor || colors.current || '#0f766e' }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">Now serving</p>
            <p className="mt-3 text-5xl font-extrabold tracking-tight sm:text-6xl">
              {token(queue.current)}
              {queue.current?.status === 'called' || queue.current?.status === 'in_service' ? ' ✓' : ''}
            </p>
            {queue.current?.serviceCode && <p className="mt-2 text-sm text-white/80">{queue.current.serviceCode}</p>}
          </div>
          <div 
            className={`min-h-36 rounded-xl p-5 text-white sm:min-h-40 sm:p-6 transition-all`}
            style={{ backgroundColor: queue.next?.tokenColor || colors.next || '#7c3aed' }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">Next queue</p>
            <p className="mt-3 text-5xl font-extrabold tracking-tight sm:text-6xl">{token(queue.next)}</p>
            {queue.next?.serviceCode && <p className="mt-2 text-sm text-white/80">{queue.next.serviceCode}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 shrink-0">
          {[
            { label: 'Total', value: queue.total ?? 0, icon: Users, border: colors.accent || '#0d9488' },
            { label: 'Waiting', value: queue.waitingCount ?? 0, icon: Clock3, border: '#2563eb' },
            { label: 'Confirmed', value: queue.confirmedCount ?? 0, icon: Activity, border: '#f97316' },
          ].map(({ label, value, icon: Icon, border }) => (
            <div key={label} className="rounded-lg border-t-[3px] bg-slate-50 px-2 py-3 text-center sm:py-4" style={{ borderTopColor: border }}>
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs"><Icon size={13} /> {label}</div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{value}</p>
            </div>
          ))}
        </div>

        {/* Confirmed Appointments */}
        {queue.confirmed && queue.confirmed.length > 0 && (
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-semibold">Confirmed Appointments</h3>
                <p className="text-xs text-slate-500">Waiting to check in</p>
              </div>
              <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">{queue.confirmed.length}</span>
            </div>
            <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {queue.confirmed.map((entry) => {
                const bgColor = entry.tokenColor || '#64748b';
                const priorityLabel = entry.priority === 'emergency' ? '⚡' : 
                                     entry.priority === 'high' ? '👑' : 
                                     '•';
                return (
                  <li key={entry._id} className="flex flex-col rounded-lg bg-slate-50 px-2 py-1.5 text-xs opacity-60 border border-slate-200">
                    <div className="flex items-center gap-1">
                      <span 
                        className="font-bold px-1.5 py-0.5 rounded text-white text-xs"
                        style={{ backgroundColor: bgColor }}
                      >
                        {token(entry)}
                      </span>
                      <span className="text-slate-600">{priorityLabel}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600 truncate">{entry.customerName || 'Customer'}</div>
                    <span className="text-xs text-slate-500 truncate">{entry.serviceCode}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Waiting Tokens */}
        {queue.waiting && queue.waiting.length > 0 && (
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-semibold">Waiting tokens</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: priorityColors.standard || '#64748b' }}></div>
                    <span>Standard</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: priorityColors.vip || '#f59e0b' }}></div>
                    <span>VIP</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: priorityColors.emergency || '#ef4444' }}></div>
                    <span>Emergency</span>
                  </div>
                </div>
              </div>
              <span className="text-xs text-slate-500">{queue.waitingCount ?? 0} waiting</span>
            </div>
            <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {queue.waiting.map((entry) => {
                const bgColor = entry.tokenColor || (
                  entry.priority === 'emergency' ? priorityColors.emergency : 
                  entry.priority === 'high' ? priorityColors.vip : 
                  priorityColors.standard
                );
                const isCheckedIn = entry.status === 'queued' || entry.status === 'called' || entry.status === 'in_service';
                const priorityLabel = entry.priority === 'emergency' ? '⚡' : 
                                     entry.priority === 'high' ? '👑' : 
                                     '•';
                return (
                  <li key={entry._id} className={`flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs border border-slate-200 transition-all ${
                    isCheckedIn ? '' : 'opacity-60'
                  }`}>
                    <div className="flex items-center gap-1 min-w-0">
                      <span 
                        className={`font-bold px-1.5 py-0.5 rounded text-white text-xs transition-all relative shrink-0 ${
                          isCheckedIn ? 'ring-1 ring-green-400 brightness-110' : ''
                        }`}
                        style={{ backgroundColor: bgColor }}
                      >
                        {isCheckedIn && (
                          <div className="absolute inset-0 rounded bg-white/10 backdrop-blur-sm"></div>
                        )}
                        <span className="relative">
                          {token(entry)}
                          {isCheckedIn && ' ✓'}
                        </span>
                      </span>
                      <span className="text-slate-600 shrink-0">{priorityLabel}</span>
                    </div>
                    <span className="ml-2 truncate text-xs text-slate-500 text-right">{entry.serviceCode}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {!queue.waiting?.length && !queue.confirmed?.length && (
          <div className="text-center py-6 text-slate-500 text-sm">
            <p>No customers in queue</p>
          </div>
        )}
      </div>
    </section>
  );
}

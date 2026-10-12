/**
 * EnhancedQueueDisplay Component
 * Shows UP NEXT section with next 3 tokens horizontally
 * Shows current, next, and next-next tokens in a flow
 */
export function EnhancedQueueDisplay({ 
  queue, 
  colors = { current: '#0f766e', next: '#7c3aed', accent: '#0d9488' },
  onEditColors,
  canManage = false 
}) {
  if (!queue) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-sm text-slate-600">Loading queue...</p>
      </div>
    );
  }

  const getTokenDisplay = (token, type) => {
    if (!token) {
      return { label: '—', color: '#e2e8f0' };
    }

    let color = colors.accent;
    if (type === 'current') color = colors.current;
    if (type === 'next') color = colors.next;

    return {
      label: token.tokenLabel || `Q${token.tokenNumber}`,
      color,
      token,
    };
  };

  const current = getTokenDisplay(queue.current, 'current');
  const next = getTokenDisplay(queue.next, 'next');
  const nextNext = getTokenDisplay(queue.nextNext, 'next');
  
  // Get up to 3 next customers from waiting list for UP NEXT section
  const upNext = (queue.waiting || []).slice(0, 3);

  return (
    <div className="space-y-4">
      {/* UP NEXT - Horizontal Section */}
      {upNext.length > 0 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
          <h3 className="text-xs font-semibold text-blue-900 uppercase mb-3 px-2">UP NEXT</h3>
          <div className="flex gap-3 items-center justify-start px-2 overflow-x-auto pb-2">
            {upNext.map((token, idx) => (
              <div key={token._id} className="flex items-center gap-3 flex-shrink-0">
                <div
                  className="rounded-lg px-6 py-3 text-white text-center font-bold text-lg min-w-fit shadow-sm"
                  style={{ backgroundColor: colors.next }}
                >
                  {token.tokenLabel || `Q${token.tokenNumber}`}
                </div>
                {idx < upNext.length - 1 && (
                  <div className="text-blue-300 text-lg font-light flex-shrink-0">|</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue Status Overview */}
      <div className="rounded-lg bg-white border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Queue Flow</h2>
            <p className="text-sm text-slate-500 mt-1">
              {queue.status === 'open' ? (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Queue is live
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Queue closed
                </span>
              )}
            </p>
          </div>
          {canManage && (
            <button
              onClick={onEditColors}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              🎨 Colors
            </button>
          )}
        </div>

        {/* Token Flow */}
        <div className="flex items-center gap-4">
          {/* Current Token */}
          <div className="flex-1">
            <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Now Serving</p>
            <div
              className="rounded-lg p-6 text-white text-center transition-transform hover:scale-105"
              style={{ backgroundColor: current.color }}
            >
              <p className="text-xs font-semibold opacity-80">CURRENT</p>
              <p className="text-3xl font-bold mt-2">{current.label}</p>
              {current.token && (
                <p className="text-xs opacity-70 mt-1">{current.token.serviceCode}</p>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="text-slate-400 text-2xl flex-shrink-0">→</div>

          {/* Next Token */}
          <div className="flex-1">
            <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Next</p>
            <div
              className="rounded-lg p-6 text-white text-center transition-transform hover:scale-105"
              style={{ backgroundColor: next.color }}
            >
              <p className="text-xs font-semibold opacity-80">NEXT</p>
              <p className="text-3xl font-bold mt-2">{next.label}</p>
              {next.token && (
                <p className="text-xs opacity-70 mt-1">{next.token.serviceCode}</p>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="text-slate-400 text-2xl flex-shrink-0">→</div>

          {/* Next-Next Token */}
          <div className="flex-1">
            <p className="text-xs uppercase font-semibold text-slate-500 mb-2">After Next</p>
            <div
              className="rounded-lg p-6 text-white text-center transition-transform hover:scale-105 opacity-75"
              style={{ backgroundColor: colors.accent }}
            >
              <p className="text-xs font-semibold opacity-80">AFTER NEXT</p>
              <p className="text-3xl font-bold mt-2">{nextNext.label}</p>
              {nextNext.token && (
                <p className="text-xs opacity-70 mt-1">{nextNext.token.serviceCode}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Queue Statistics */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium text-slate-600 mb-1">Total Appointments</p>
          <p className="text-2xl font-bold text-slate-900">{queue.total || 0}</p>
          <p className="text-xs text-slate-500 mt-1">Created today</p>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-center">
          <p className="text-xs font-medium text-blue-700 mb-1">Waiting in Queue</p>
          <p className="text-2xl font-bold text-blue-900">{queue.waitingCount || 0}</p>
          <p className="text-xs text-blue-600 mt-1">Not called yet</p>
        </div>
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 text-center">
          <p className="text-xs font-medium text-purple-700 mb-1">Pending Confirmation</p>
          <p className="text-2xl font-bold text-purple-900">{queue.confirmed || 0}</p>
          <p className="text-xs text-purple-600 mt-1">Not checked in</p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
          <p className="text-xs font-medium text-emerald-700 mb-1">Served Today</p>
          <p className="text-2xl font-bold text-emerald-900">{queue.served || 0}</p>
          <p className="text-xs text-emerald-600 mt-1">Completed</p>
        </div>
      </div>
    </div>
  );
}

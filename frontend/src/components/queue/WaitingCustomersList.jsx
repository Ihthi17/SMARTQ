import { AlertCircle, Zap, Crown, ChevronDown } from 'lucide-react';
import { useState } from 'react';

/**
 * WaitingCustomersList Component
 * Displays waiting customers in a clean list format with actions
 */
export function WaitingCustomersList({ 
  waiting = [], 
  onSelectForCheckIn,
  onChangePriority,
  onCancel,
  canManage = false 
}) {
  const [expandedId, setExpandedId] = useState(null);

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'emergency':
        return {
          icon: Zap,
          color: 'bg-red-100 text-red-800 border-red-300',
          label: 'Emergency',
          bgColor: 'bg-red-50',
        };
      case 'vip':
        return {
          icon: Crown,
          color: 'bg-amber-100 text-amber-800 border-amber-300',
          label: 'VIP',
          bgColor: 'bg-amber-50',
        };
      default:
        return {
          icon: null,
          color: 'bg-slate-100 text-slate-800 border-slate-300',
          label: 'Regular',
          bgColor: 'bg-slate-50',
        };
    }
  };

  const getPriorityRowBorder = (priority) => {
    switch (priority) {
      case 'emergency':
        return 'border-l-4 border-l-red-600';
      case 'vip':
        return 'border-l-4 border-l-amber-600';
      default:
        return 'border-l-4 border-l-slate-300';
    }
  };

  if (!waiting || waiting.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <p className="text-sm text-slate-600">No waiting customers</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-semibold text-slate-900">Waiting Customers</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          {waiting.length} waiting
        </span>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
        {waiting.map((entry, index) => {
          const priorityInfo = getPriorityBadge(entry.priority);
          const PriorityIcon = priorityInfo.icon;
          const isExpanded = expandedId === entry._id;

          return (
            <div
              key={entry._id}
              className={`transition-colors ${getPriorityRowBorder(entry.priority)} ${priorityInfo.bgColor}`}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                {/* Position and Token */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-semibold text-sm">
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">
                      {entry.tokenLabel || `Q${entry.tokenNumber}`}
                    </p>
                    <p className="text-xs text-slate-600">
                      {entry.serviceCode}
                    </p>
                  </div>
                </div>

                {/* Wait Time */}
                {entry.estimatedWaitMinutes !== undefined && (
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-medium text-slate-900">
                      {entry.estimatedWaitMinutes}m
                    </p>
                    <p className="text-xs text-slate-500">wait</p>
                  </div>
                )}

                {/* Status Badge */}
                {entry.priority !== 'normal' && (
                  <div className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full border ${priorityInfo.color}`}>
                    {PriorityIcon && <PriorityIcon size={14} />}
                    <span className="text-xs font-medium">{priorityInfo.label}</span>
                  </div>
                )}

                {/* Checkmark for attended */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <span className="text-xs">✓</span>
                </div>

                {/* Expand button if actions available */}
                {canManage && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry._id)}
                    className="flex-shrink-0 p-1 rounded hover:bg-slate-200 transition-colors"
                  >
                    <ChevronDown 
                      size={18} 
                      className={`text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </div>

              {/* Expanded Actions */}
              {isExpanded && canManage && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 space-y-2">
                  <button
                    onClick={() => onSelectForCheckIn(entry)}
                    className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 transition-colors"
                  >
                    Check In
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onChangePriority(entry._id, entry.priority === 'emergency' ? 'normal' : 'emergency')}
                      className="rounded-lg border border-red-300 bg-red-50 px-2 py-2 text-xs font-medium text-red-900 hover:bg-red-100 transition-colors"
                    >
                      {entry.priority === 'emergency' ? 'Remove Emergency' : 'Mark Emergency'}
                    </button>
                    <button
                      onClick={() => onCancel(entry._id)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

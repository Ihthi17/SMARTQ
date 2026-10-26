import { AlertCircle, CheckCircle, User, Settings, Calendar, ListOrdered } from 'lucide-react';

const getEventIcon = (action) => {
  const iconMap = {
    'appointment.created': Calendar,
    'appointment.confirmed': CheckCircle,
    'appointment.completed': CheckCircle,
    'appointment.cancelled': AlertCircle,
    'appointment.checked_in': ListOrdered,
    'user.created': User,
    'user.updated': User,
    'queue.paused': AlertCircle,
    'queue.resumed': CheckCircle,
    'service.created': Settings,
    'service.updated': Settings,
    'location.created': Settings,
    'location.updated': Settings,
  };
  return iconMap[action] || AlertCircle;
};

const getEventColor = (action) => {
  if (action.includes('completed') || action.includes('confirmed') || action.includes('created')) return 'text-green-600 bg-green-50';
  if (action.includes('cancelled') || action.includes('paused')) return 'text-red-600 bg-red-50';
  if (action.includes('updated')) return 'text-blue-600 bg-blue-50';
  return 'text-slate-600 bg-slate-50';
};

const formatDescription = (action, details) => {
  const actionText = {
    'appointment.created': 'New appointment created',
    'appointment.confirmed': 'Appointment confirmed',
    'appointment.completed': 'Appointment completed',
    'appointment.cancelled': 'Appointment cancelled',
    'appointment.checked_in': 'Customer checked in',
    'user.created': 'New user registered',
    'user.updated': 'User information updated',
    'queue.paused': 'Queue paused',
    'queue.resumed': 'Queue resumed',
    'service.created': 'New service created',
    'service.updated': 'Service updated',
    'location.created': 'New location added',
    'location.updated': 'Location updated',
  };
  return actionText[action] || action;
};

const formatTime = (timestamp) => {
  const now = new Date();
  const eventTime = new Date(timestamp);
  const diffMs = now - eventTime;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return eventTime.toLocaleDateString();
};

export default function ActivityFeed({ activities = [], loading = false, error = null }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex gap-3 p-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-200" />
            <div className="flex-1">
              <div className="h-4 bg-slate-200 rounded w-48 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle size={20} className="text-red-600" />
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity, idx) => {
        const Icon = getEventIcon(activity.action);
        const colorClass = getEventColor(activity.action);

        return (
          <div key={idx} className="flex gap-3 p-3 hover:bg-slate-50 rounded-lg transition">
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Icon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {formatDescription(activity.action, activity.details)}
              </p>
              <div className="flex gap-2 mt-1 text-xs text-slate-500">
                <span>{formatTime(activity.createdAt)}</span>
                {activity.actor?.username && (
                  <>
                    <span>•</span>
                    <span>by {activity.actor.username}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

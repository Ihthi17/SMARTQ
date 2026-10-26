import { TrendingUp, TrendingDown } from 'lucide-react';

export default function SummaryCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color = 'teal',
  trend,
  trendLabel,
  loading = false,
}) {
  const colorClasses = {
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className={`rounded-xl border shadow-sm p-5 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-70">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 bg-slate-200 rounded animate-pulse w-24" />
          ) : (
            <>
              <p className="text-3xl font-bold mt-1">{value}</p>
              {subtitle && <p className="text-xs opacity-60 mt-2">{subtitle}</p>}
            </>
          )}
        </div>
        {Icon && !loading && (
          <div className="p-2 bg-white bg-opacity-50 rounded-lg">
            <Icon size={24} />
          </div>
        )}
      </div>

      {trend && trendLabel && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          {trend > 0 ? (
            <>
              <TrendingUp size={14} className="text-green-600" />
              <span className="text-green-600">+{trend}% {trendLabel}</span>
            </>
          ) : trend < 0 ? (
            <>
              <TrendingDown size={14} className="text-red-600" />
              <span className="text-red-600">{trend}% {trendLabel}</span>
            </>
          ) : (
            <span className="text-slate-600">No change</span>
          )}
        </div>
      )}
    </div>
  );
}

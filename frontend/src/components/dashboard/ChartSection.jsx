import { AlertCircle, RotateCcw } from 'lucide-react';

export default function ChartSection({
  title,
  description,
  children,
  loading = false,
  error = null,
  onRetry,
  height = 'h-80',
}) {
  if (loading) {
    return (
      <div className={`rounded-xl bg-white border border-slate-200 shadow-sm p-6 ${height} flex items-center justify-center`}>
        <div className="text-center">
          <div className="inline-block h-8 w-8 bg-slate-200 rounded-full animate-pulse mb-3" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-xl bg-red-50 border border-red-200 shadow-sm p-6 ${height} flex items-center justify-center`}>
        <div className="text-center">
          <AlertCircle size={32} className="text-red-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-900 mb-2">Failed to load data</p>
          <p className="text-xs text-red-700 mb-4">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition"
            >
              <RotateCcw size={14} /> Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      </div>
      <div className={height}>{children}</div>
    </div>
  );
}

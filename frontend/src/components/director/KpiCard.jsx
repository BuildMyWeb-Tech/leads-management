export default function KpiCard({ label, value, sub, color = 'text-gray-900', icon, highlight }) {
  return (
    <div className={`card flex items-start gap-3 ${highlight ? 'ring-1 ring-blue-200 bg-blue-50/30' : ''}`}>
      {icon && (
        <div className="w-9 h-9 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 shadow-sm">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 leading-none ${color}`}>{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

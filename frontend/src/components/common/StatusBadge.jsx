const STATUS_STYLES = {
  'New':           'bg-blue-100 text-blue-700',
  'Contacted':     'bg-yellow-100 text-yellow-700',
  'Interested':    'bg-green-100 text-green-700',
  'Not Interested':'bg-red-100 text-red-700',
  'Closed':        'bg-gray-100 text-gray-600',
};

export default function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status || '—'}
    </span>
  );
}

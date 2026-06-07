// PHASE 1: expanded status pipeline
const STATUS_STYLES = {
  'New':                'bg-blue-100 text-blue-700',
  'Allocated':          'bg-indigo-100 text-indigo-700',
  'Called':             'bg-yellow-100 text-yellow-700',
  'Follow Up':          'bg-orange-100 text-orange-700',
  'Site Visit Planned': 'bg-purple-100 text-purple-700',
  'Site Visit Done':    'bg-violet-100 text-violet-700',
  'Interested':         'bg-green-100 text-green-700',
  'Negotiation':        'bg-teal-100 text-teal-700',
  'Booked':             'bg-emerald-100 text-emerald-700',
  'Wrong Number':       'bg-red-100 text-red-500',
  'Not Interested':     'bg-red-100 text-red-700',
  'Closed':             'bg-gray-100 text-gray-600',
};

export default function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status || '—'}
    </span>
  );
}

import { STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

export default function StatusBadge({ status, size = 'md' }) {
  const cls = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-500 ring-gray-200';
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${sizeClass} ${cls}`}>
      {status || '—'}
    </span>
  );
}
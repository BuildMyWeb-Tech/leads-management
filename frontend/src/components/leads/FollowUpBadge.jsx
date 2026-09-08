/**
 * FollowUpBadge — computes Upcoming / Pending (Overdue) purely from
 * the lead's own `followUpDate` (+ `status`) at render time. There is
 * no stored "isOverdue" flag anywhere — this mirrors the backend's
 * own rule (backend/utils/followUpHelper.js: overdue only while
 * status is still 'Follow Up' and the date/time has passed).
 */
export default function FollowUpBadge({ followUpDate, status, size = 'md' }) {
  if (!followUpDate) return null;

  const date = new Date(followUpDate);
  const now = new Date();
  const isOverdue = status === 'Follow Up' && date.getTime() < now.getTime();

  const formatted = date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${sizeClass}
        ${isOverdue
          ? 'bg-red-100 text-red-700 ring-red-200 animate-pulse'
          : 'bg-orange-50 text-orange-600 ring-orange-200'}`}
      title={formatted}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {isOverdue ? 'Overdue' : 'Upcoming'}: {formatted}
    </span>
  );
}

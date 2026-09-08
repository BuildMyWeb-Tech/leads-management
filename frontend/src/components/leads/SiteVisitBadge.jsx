import { SITE_VISIT_BADGE_CLASSES, SITE_VISIT_STATUS_LABELS } from '../../constants/leadConstants';

/**
 * SiteVisitBadge — summarizes a lead's most recent site visit entry
 * (from the backend `siteVisits` array — Lead.js, Phase B/C). Purely
 * presentational; does not invent a separate frontend site-visit
 * model.
 */
export default function SiteVisitBadge({ siteVisits, size = 'sm' }) {
  if (!Array.isArray(siteVisits) || siteVisits.length === 0) return null;

  const latest = siteVisits[siteVisits.length - 1];
  const cls = SITE_VISIT_BADGE_CLASSES[latest.status] || 'bg-gray-100 text-gray-500 ring-gray-200';
  const label = SITE_VISIT_STATUS_LABELS[latest.status] || latest.status;
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  const dateLabel = latest.status === 'completed'
    ? (latest.completedDate ? new Date(latest.completedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '')
    : (latest.plannedDate ? new Date(latest.plannedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${sizeClass} ${cls}`}>
      Site Visit: {label}{dateLabel ? ` (${dateLabel})` : ''}
    </span>
  );
}

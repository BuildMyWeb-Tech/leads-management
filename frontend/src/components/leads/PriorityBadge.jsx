import { PRIORITY_BADGE_CLASSES, PRIORITY_DOT_CLASSES } from '../../constants/leadConstants';

/**
 * PriorityBadge — pure display component for the backend-controlled
 * `priority` field (Hot/Warm/Cold). Never computes or mutates
 * priority itself — the backend's automatic escalation rules
 * (leadBusinessRules.js) are the single source of truth; this
 * component only renders whatever value the API returned.
 */
export default function PriorityBadge({ priority, size = 'md' }) {
  if (!priority) return null;
  const cls = PRIORITY_BADGE_CLASSES[priority] || 'bg-gray-100 text-gray-500 ring-gray-200';
  const dot = PRIORITY_DOT_CLASSES[priority] || 'bg-gray-400';
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${sizeClass} ${cls}`}
      title={`Priority: ${priority}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {priority}
    </span>
  );
}

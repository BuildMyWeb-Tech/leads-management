import { STATUS_BADGE_CLASSES, STATUS_BAR_COLORS } from '../../constants/leadConstants';

const ACTIVE_PIPELINE = [
  'New', 'Allocated', 'Called', 'Follow Up',
  'Site Visit Planned', 'Site Visit Done',
  'Interested', 'Negotiation', 'Booked',
];

const COLORS = [
  '#3b82f6','#6366f1','#eab308','#f97316',
  '#8b5cf6','#7c3aed','#22c55e','#14b8a6','#10b981',
];

/**
 * PipelineDonut — SVG donut chart for status distribution.
 * Shows active pipeline stages only (excludes dead statuses).
 */
export default function PipelineDonut({ statusBreakdown }) {
  const activeData = ACTIVE_PIPELINE
    .map((s, i) => {
      const found = statusBreakdown.find((b) => b._id === s);
      return { label: s, count: found ? found.count : 0, color: COLORS[i] };
    })
    .filter((d) => d.count > 0);

  const total = activeData.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-gray-400">
        No active pipeline data
      </div>
    );
  }

  // Build SVG arcs
  const cx = 70, cy = 70, r = 52, inner = 34;
  let startAngle = -Math.PI / 2;
  const arcs = activeData.map((d) => {
    const angle = (d.count / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + inner * Math.cos(startAngle);
    const iy1 = cy + inner * Math.sin(startAngle);
    const ix2 = cx + inner * Math.cos(endAngle);
    const iy2 = cy + inner * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    const path = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ');
    const result = { ...d, path, angle };
    startAngle = endAngle;
    return result;
  });

  return (
    <div className="flex items-center gap-4">
      {/* Donut */}
      <svg viewBox="0 0 140 140" className="w-28 h-28 flex-shrink-0">
        {arcs.map((arc, i) => (
          <path key={i} d={arc.path} fill={arc.color} opacity="0.85" />
        ))}
        {/* Center label */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1f2937">{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#9ca3af">ACTIVE</text>
      </svg>

      {/* Legend */}
      <div className="flex-1 space-y-1.5">
        {arcs.slice(0, 6).map((arc, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: arc.color }} />
            <span className="text-xs text-gray-600 flex-1 truncate">{arc.label}</span>
            <span className="text-xs font-semibold text-gray-700">{arc.count}</span>
          </div>
        ))}
        {arcs.length > 6 && (
          <p className="text-xs text-gray-400">+{arcs.length - 6} more</p>
        )}
      </div>
    </div>
  );
}

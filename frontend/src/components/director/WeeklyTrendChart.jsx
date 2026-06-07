/**
 * WeeklyTrendChart — SVG bar chart for leads per day (last 7 days).
 * Pure SVG, no external chart library needed.
 */
export default function WeeklyTrendChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-gray-400">
        No data for this period
      </div>
    );
  }

  // Fill in missing days so we always show 7 bars
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = data.find((r) => r._id === key);
    days.push({
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      date:  key,
      count: found ? found.count : 0,
    });
  }

  const maxVal = Math.max(...days.map((d) => d.count), 1);
  const W = 320, H = 100, padX = 20, padY = 12, barW = 28, gap = 8;
  const chartW = W - padX * 2;
  const step   = chartW / days.length;

  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} className="w-full">
      {/* Grid lines */}
      {[0, 0.5, 1].map((pct) => {
        const y = padY + (H - padY) * (1 - pct);
        return (
          <line key={pct} x1={padX} y1={y} x2={W - padX} y2={y}
            stroke="#f3f4f6" strokeWidth="1" />
        );
      })}

      {days.map((day, i) => {
        const barH   = maxVal > 0 ? ((day.count / maxVal) * (H - padY - 4)) : 0;
        const x      = padX + i * step + step / 2 - barW / 2;
        const y      = padY + (H - padY) - barH;
        const isEmpty = day.count === 0;

        return (
          <g key={day.date}>
            {/* Bar */}
            <rect
              x={x} y={isEmpty ? H - 4 : y}
              width={barW} height={isEmpty ? 4 : barH}
              rx="3"
              fill={isEmpty ? '#e5e7eb' : '#3b82f6'}
              opacity={isEmpty ? 0.5 : 0.85}
            />
            {/* Count label */}
            {day.count > 0 && (
              <text x={x + barW / 2} y={y - 3}
                textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="500">
                {day.count}
              </text>
            )}
            {/* Day label */}
            <text x={x + barW / 2} y={H + 20}
              textAnchor="middle" fontSize="10" fill="#9ca3af">
              {day.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

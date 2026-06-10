import { STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

export default function CallHistoryTimeline({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="text-center py-6">
        <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24"
          stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-gray-400">No call history yet</p>
      </div>
    );
  }

  const sorted = [...history].reverse();

  return (
    <div className="space-y-0">
      {sorted.map((entry, i) => {
        const badgeCls = STATUS_BADGE_CLASSES[entry.status] ||
          'bg-gray-100 text-gray-500 ring-gray-200';
        const date   = new Date(entry.updatedAt);
        const isLast = i === sorted.length - 1;

        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center w-6 flex-shrink-0">
              <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0
                ${i === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
              {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1" />}
            </div>
            <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-3'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                  text-xs font-medium ring-1 ring-inset ${badgeCls}`}>
                  {entry.status}
                </span>
                <span className="text-xs text-gray-400">
                  {date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {' · '}
                  {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {entry.updatedBy?.name && (
                  <span className="text-xs text-gray-400">by {entry.updatedBy.name}</span>
                )}
              </div>
              {entry.notes && (
                <p className="text-xs text-gray-600 mt-1 italic">"{entry.notes}"</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
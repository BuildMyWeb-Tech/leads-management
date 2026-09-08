/**
 * CallHistoryList — displays the backend `callHistory` array
 * (Lead.js, Phase B/C) newest-first. Purely presentational: this
 * component never appends/mutates history itself — recording a new
 * call happens through the existing StatusEditor (status/notes save),
 * which the backend automatically appends to callHistory and
 * refreshes lastCallDetails for (see leadUpdateHelpers.js). No
 * call-history logic is duplicated here.
 */
export default function CallHistoryList({ callHistory }) {
  if (!Array.isArray(callHistory) || callHistory.length === 0) {
    return <p className="text-sm text-gray-300">No calls recorded yet.</p>;
  }

  // Newest first — backend appends chronologically, so reverse for display.
  const entries = [...callHistory].reverse();

  return (
    <ol className="space-y-2.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
      {entries.map((entry, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-700">
                {entry.updatedAt
                  ? new Date(entry.updatedAt).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </span>
              {entry.status && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{entry.status}</span>
              )}
              {/* Caller display only if backend actually populated it */}
              {entry.updatedBy?.name && (
                <span className="text-xs text-gray-400">by {entry.updatedBy.name}</span>
              )}
            </div>
            {entry.notes && (
              <p className="text-sm text-gray-600 mt-0.5 break-words">{entry.notes}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

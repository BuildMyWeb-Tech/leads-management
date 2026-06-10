import { LEAD_SOURCES } from '../../constants/leadConstants';

export default function LeadPreviewCard({ lead, onChange }) {
  const isDup = lead.isDuplicate;
  const set   = (field) => (e) => onChange(lead.id, { ...lead, [field]: e.target.value });

  return (
    <div className={`rounded-xl border p-4 transition-all
      ${!lead.selected
        ? 'opacity-50 bg-gray-50 border-gray-200'
        : isDup
          ? 'bg-orange-50 border-orange-200'
          : 'bg-white border-gray-200 shadow-sm'}`}>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={lead.selected && !isDup}
          disabled={isDup}
          onChange={(e) => onChange(lead.id, { ...lead, selected: e.target.checked })}
          className="w-5 h-5 mt-1 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0
                     touch-manipulation"
        />

        <div className="flex-1 min-w-0 space-y-2">
          {isDup && (
            <div className="flex items-center gap-2 bg-orange-100 border border-orange-200
                            rounded-lg px-3 py-1.5">
              <svg className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" fill="none"
                viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-xs font-medium text-orange-700">
                Duplicate — {lead.existing?.name || 'already exists'} ({lead.existing?.status || ''})
              </span>
            </div>
          )}

          {/* Name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-1">
                Name
              </label>
              <input
                className="input text-sm py-1.5"
                placeholder="Enter name..."
                value={lead.name}
                onChange={set('name')}
                disabled={isDup}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-1">
                Phone
              </label>
              <div className="relative">
                <input
                  className={`input text-sm py-1.5 font-mono
                    ${isDup ? 'border-orange-300' : ''}`}
                  value={lead.phone}
                  onChange={set('phone')}
                  disabled={isDup}
                  maxLength={10}
                  inputMode="numeric"
                />
                {!isDup && lead.phone?.length === 10 && (
                  <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-500"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-1">
              Source
            </label>
            <select
              className="input text-sm py-1.5"
              value={lead.source || 'Other'}
              onChange={set('source')}
              disabled={isDup}
            >
              {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          {lead.extra && (
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-1">
                Extracted context
              </label>
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md
                            px-2.5 py-1.5 italic">
                {lead.extra}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
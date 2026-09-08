/**
 * LeadFieldSection — generic titled section + 2-col field grid, used
 * throughout LeadDetailDrawer to avoid repeating the same
 * heading/grid markup for every section (Lead Info, Property, etc.).
 */
export function LeadFieldSection({ title, children, action }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

export function FieldRow({ label, value, highlight }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-sm break-words ${highlight ? 'text-orange-500 font-medium' : 'text-gray-800'}`}>
        {value || <span className="text-gray-300">—</span>}
      </span>
    </div>
  );
}
